import hashlib
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from server.app import create_app


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = create_app(self.temp.name, 'test-service', mailer=lambda *args: 'pending_delivery')
        self.client = TestClient(self.app, headers={'X-Kanook-Service': 'test-service'})
        self.addCleanup(self.client.close)

    def project(self, name='Solo project'):
        response = self.client.post('/workspace/projects', json={'name': name})
        self.assertEqual(response.status_code, 201)
        return response.json()['id']

    def test_projects_persist_without_invitations(self):
        project = self.project()
        detail = self.client.get('/workspace/projects/' + project).json()
        self.assertEqual(detail['members'], [])
        self.assertEqual(detail['files'], [])
        with TestClient(create_app(self.temp.name, 'test-service'), headers={'X-Kanook-Service': 'test-service'}) as reopened:
            self.assertEqual(reopened.get('/workspace/projects').json()['items'][0]['id'], project)

    def test_authentication_and_origin_boundary(self):
        with TestClient(self.app) as anonymous:
            self.assertEqual(anonymous.get('/workspace/projects').status_code, 401)
            self.assertEqual(anonymous.get('/workspace/projects/unknown').status_code, 401)
        denied = self.client.post('/workspace/projects', json={'name': 'Blocked'}, headers={'Origin': 'https://evil.example'})
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.client.get('/workspace/projects').json()['items'], [])

    def test_real_bytes_and_digest_and_safe_storage(self):
        project = self.project()
        data = b'fixture-content\x00\x01'
        response = self.client.post(f'/workspace/projects/{project}/files', params={'filename': 'clip.mp4'}, content=data)
        self.assertEqual(response.status_code, 201)
        item = response.json()
        self.assertEqual(item['sha256'], hashlib.sha256(data).hexdigest())
        self.assertNotIn('location', item)
        saved = list((Path(self.temp.name) / 'uploads' / project).iterdir())
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0].suffix, '.mp4')
        self.assertEqual(saved[0].read_bytes(), data)
        for filename in ['../escape', 'C:\\escape', '.', '..']:
            self.assertEqual(self.client.post(f'/workspace/projects/{project}/files', params={'filename': filename}, content=data).status_code, 422)

    def test_empty_and_oversized_uploads_leave_no_partial_files(self):
        project = self.project()
        self.app.state.max_upload = 4
        for data, expected in [(b'', 422), (b'12345', 413)]:
            self.assertEqual(self.client.post(f'/workspace/projects/{project}/files?filename=test.txt', content=data).status_code, expected)
        self.assertEqual(self.client.get(f'/workspace/projects/{project}/files').json()['items'], [])
        self.assertEqual(list((Path(self.temp.name) / 'uploads' / project).iterdir()), [])

    def test_upload_key_is_hashed_expiring_and_project_scoped(self):
        first, second = self.project('One'), self.project('Two')
        key = self.client.post(f'/workspace/projects/{first}/api-keys', json={'lifetime_hours': 24}).json()
        self.assertEqual(key['scope'], 'project_upload')
        with TestClient(self.app, headers={'Authorization': 'Bearer ' + key['token']}) as api:
            self.assertEqual(api.post(f'/workspace/projects/{first}/files?filename=sample.txt', content=b'hello').status_code, 201)
            self.assertEqual(len(api.get(f'/workspace/projects/{first}/files').json()['items']), 1)
            self.assertEqual(api.get(f'/workspace/projects/{second}/files').status_code, 401)
            self.assertEqual(api.post('/workspace/projects', json={'name': 'Forbidden'}).status_code, 401)
            self.assertEqual(api.post(f'/workspace/projects/{first}/invitations', json={'email': 'test@example.test'}).status_code, 401)
            with self.app.state.store.connect() as db:
                saved = dict(db.execute('SELECT * FROM api_keys').fetchone())
                self.assertNotIn(key['token'], str(saved))
                db.execute('UPDATE api_keys SET expires=?', (time.time() - 1,))
            self.assertEqual(api.get(f'/workspace/projects/{first}/files').status_code, 401)

    def test_invite_later_tracks_delivery_and_one_time_acceptance(self):
        project = self.project()
        response = self.client.post(f'/workspace/projects/{project}/invitations', json={'email': ' Person@example.test '})
        self.assertEqual(response.status_code, 201)
        invite = response.json()
        self.assertEqual(invite['status'], 'pending_delivery')
        self.assertEqual(invite['email'], 'person@example.test')
        token = invite['invitation_url'].split('invitation=')[1]
        self.assertEqual(self.client.post(f'/workspace/projects/{project}/invitations', json={'email': 'person@example.test'}).status_code, 409)
        self.assertEqual(self.client.post('/workspace/invitations/accept', json={'token': token}).json()['id'], project)
        self.assertEqual(self.client.post('/workspace/invitations/accept', json={'token': token}).status_code, 404)
        member = self.client.get('/workspace/projects/' + project).json()['members'][0]
        self.assertEqual(member['status'], 'accepted')
        self.assertNotIn('invitation_url', member)
        self.assertNotIn('token_hash', member)

    def test_email_delivery_result_is_not_fabricated(self):
        project = self.project()
        for status in ['sent', 'delivery_failed']:
            self.app.state.mailer = lambda *args: status
            invitation = self.client.post(f'/workspace/projects/{project}/invitations', json={'email': status + '@example.test'}).json()
            self.assertEqual(invitation['status'], status)

    def test_s3_pagination_and_no_secret_persistence(self):
        calls = []
        class Bucket:
            def list_objects_v2(self, **kwargs):
                calls.append(kwargs)
                if kwargs.get('ContinuationToken'):
                    return {'Contents': [{'Key': 'videos/two.mp4', 'Size': 20}]}
                return {'Contents': [{'Key': 'videos/', 'Size': 0}, {'Key': 'videos/one.mp4', 'Size': 10}], 'NextContinuationToken': 'page-two'}
        self.app.state.s3_factory = lambda *args, **kwargs: Bucket()
        project = self.project()
        body = dict(bucket_url='s3://example-bucket/videos/', region='us-east-1', access_key_id='fixture-access', secret_access_key='fixture-secret')
        response = self.client.post(f'/workspace/projects/{project}/s3', json=body)
        self.assertEqual(response.status_code, 201)
        connection = response.json()
        self.assertEqual(connection['indexed'], 1)
        more = self.client.post(f'/workspace/projects/{project}/s3/{connection["id"]}/index', json={'cursor': connection['next_cursor']})
        self.assertEqual(more.status_code, 200)
        self.assertEqual(calls[1]['ContinuationToken'], 'page-two')
        self.assertEqual(calls[1]['Prefix'], 'videos/')
        self.assertEqual(len(self.client.get(f'/workspace/projects/{project}/files').json()['items']), 2)
        self.client.post(f'/workspace/projects/{project}/s3', json=body)
        self.assertEqual(len(self.client.get(f'/workspace/projects/{project}/files').json()['items']), 2)
        self.assertNotIn(b'fixture-secret', (Path(self.temp.name) / 'workspace.sqlite').read_bytes())
        self.assertNotIn('fixture-secret', response.text)

    def test_s3_failure_and_invalid_request_redact_secrets(self):
        project = self.project()
        class Denied:
            def list_objects_v2(self, **kwargs):
                raise ClientError({'Error': {'Code': 'AccessDenied', 'Message': 'fixture-secret'}}, 'ListObjectsV2')
        self.app.state.s3_factory = lambda *args, **kwargs: Denied()
        body = dict(bucket_url='s3://example-bucket/', region='us-east-1', access_key_id='fixture-access', secret_access_key='fixture-secret')
        for payload, code in [(body, 400), ({**body, 'region': 123}, 422), ({**body, 'bucket_url': 'http://127.0.0.1'}, 422)]:
            response = self.client.post(f'/workspace/projects/{project}/s3', json=payload)
            self.assertEqual(response.status_code, code)
            self.assertNotIn('fixture-secret', response.text)
        self.assertEqual(self.client.get(f'/workspace/projects/{project}/files').json()['items'], [])

    def test_project_name_validation(self):
        for name in ['', '   ', 'line\nbreak', 'x' * 101]:
            self.assertEqual(self.client.post('/workspace/projects', json={'name': name}).status_code, 422)

    def test_named_keys_list_metadata_and_multiple_keys_without_secrets(self):
        project = self.project()
        first = self.client.post(f'/workspace/projects/{project}/api-keys', json={'name': 'Development', 'lifetime_hours': 24}).json()
        second = self.client.post(f'/workspace/projects/{project}/api-keys', json={'name': 'Automation', 'lifetime_hours': 168}).json()
        listing = self.client.get(f'/workspace/projects/{project}/api-keys')
        self.assertEqual({key['name'] for key in listing.json()['items']}, {'Development', 'Automation'})
        self.assertNotIn(first['token'], listing.text)
        self.assertNotIn(second['token'], listing.text)
        self.assertNotIn('token_hash', listing.text)
        with TestClient(self.app, headers={'Authorization': 'Bearer ' + first['token']}) as api:
            self.assertEqual(api.get(f'/workspace/projects/{project}/api-keys').status_code, 401)
            self.assertEqual(api.get(f'/workspace/projects/{project}/files').status_code, 200)
        key = next(key for key in self.client.get(f'/workspace/projects/{project}/api-keys').json()['items'] if key['id'] == first['id'])
        self.assertIsNotNone(key['last_used'])

    def test_project_requirements_status_and_configuration_persist(self):
        project = self.project()
        item = self.client.post(f'/workspace/projects/{project}/files?filename=clip.mp4', content=b'fixture').json()
        requirements = {'mode': 'structured', 'visual_similarity': {'context': 20, 'scene': None}, 'label_balance': [{'label': 'Kitchen', 'target': 40}]}
        updated = self.client.patch(f'/workspace/projects/{project}', json={'requirements': requirements, 'configuration': {'target_score': 85, 'selected_file_ids': [item['id']]}})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()['requirements']['visual_similarity']['context'], 20)
        self.assertIsNone(updated.json()['requirements']['visual_similarity']['scene'])
        self.assertEqual(updated.json()['configuration']['target_score'], 85)
        self.client.patch(f'/workspace/projects/{project}', json={'status': 'completed'})
        self.assertEqual(self.client.get('/workspace/projects').json()['items'][0]['status'], 'completed')
        self.assertEqual(self.client.get('/workspace/projects').json()['items'][0]['file_count'], 1)
        # Editing requirements for a rerun retains the original uploaded dataset.
        self.client.patch(f'/workspace/projects/{project}', json={'requirements': {'mode': 'notes', 'notes': 'Different requirements'}})
        with TestClient(create_app(self.temp.name, 'test-service'), headers={'X-Kanook-Service': 'test-service'}) as reopened:
            detail = reopened.get(f'/workspace/projects/{project}').json()
            self.assertEqual(detail['requirements']['notes'], 'Different requirements')
            self.assertEqual(detail['configuration']['selected_file_ids'], [item['id']])
            self.assertEqual(detail['files'][0]['id'], item['id'])
            self.assertEqual(detail['status'], 'completed')

    def test_requirements_and_selection_validation_and_key_permissions(self):
        project = self.project()
        invalid = [
            {'status': 'finished'},
            {'requirements': {'visual_similarity': {'context': 101}}},
            {'requirements': {'label_balance': [{'label': 'A', 'target': 60}, {'label': 'B', 'target': 60}]}},
            {'requirements': {'label_balance': [{'label': 'A', 'target': 50}, {'label': 'a', 'target': 50}]}},
            {'configuration': {'target_score': -1}},
            {'configuration': {'selected_file_ids': ['another-project-file']}},
        ]
        for body in invalid:
            self.assertEqual(self.client.patch(f'/workspace/projects/{project}', json=body).status_code, 422)
        key = self.client.post(f'/workspace/projects/{project}/api-keys', json={}).json()
        with TestClient(self.app, headers={'Authorization': 'Bearer ' + key['token']}) as api:
            self.assertEqual(api.patch(f'/workspace/projects/{project}', json={'status': 'completed'}).status_code, 401)

    def test_additive_metadata_preserves_legacy_projects_and_keys(self):
        with tempfile.TemporaryDirectory() as folder:
            with sqlite3.connect(Path(folder) / 'workspace.sqlite') as db:
                db.execute('CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,created REAL)')
                db.execute('CREATE TABLE api_keys(id TEXT PRIMARY KEY,project_id TEXT,token_hash TEXT UNIQUE,expires REAL)')
                db.execute('INSERT INTO projects VALUES (?,?,?)', ('old-project', 'Existing project', 1))
                db.execute('INSERT INTO api_keys VALUES (?,?,?,?)', ('old-key', 'old-project', hashlib.sha256(b'legacy-token').hexdigest(), time.time() + 3600))
            db.close()
            app = create_app(folder, 'test-service')
            with TestClient(app, headers={'X-Kanook-Service': 'test-service'}) as client:
                self.assertEqual(client.get('/workspace/projects').json()['items'][0]['status'], 'ongoing')
                key = client.get('/workspace/projects/old-project/api-keys').json()['items'][0]
                self.assertEqual(key['name'], 'Upload key')
                self.assertIsNone(key['created'])
                self.assertTrue(app.state.store.key_allows('old-project', 'legacy-token'))


if __name__ == '__main__':
    unittest.main()
