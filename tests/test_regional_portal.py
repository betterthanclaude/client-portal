"""Offline integration proof against the cloned kanook-0 regional API."""
import os
from pathlib import Path
import sys
import tempfile
import unittest

BACKEND = Path(os.environ.get('KANOOK_BACKEND_REPO', Path(__file__).parents[1] / '.local/data-ingest-kanook-0'))
sys.path.insert(0, str(BACKEND))
from fastapi.testclient import TestClient
from oruel.service.account_store import RegionalStore
from oruel.service.regional_api import create_app

ORIGIN = 'http://127.0.0.1:8780'
PORTAL = 'http://localhost:5190'


class PortalIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'account.sqlite'
        self.store = RegionalStore(self.path)
        invitation = self.store.create_organization('alpha', 'Alpha', 'owner@alpha.example')
        self.owner = self.store.accept_invitation(invitation['invitation_token'])
        self.client = TestClient(create_app(self.store, origin=ORIGIN, secure_cookies=False,
                                           portal_origins=(PORTAL,)), base_url=ORIGIN)
        self.addCleanup(self.client.close)
        signed_in = self.client.post('/account/v1/login', json={'key': self.owner['token']}, headers={'Origin': PORTAL})
        self.assertEqual(signed_in.status_code, 200)
        self.headers = {'Origin': PORTAL, 'X-CSRF-Token': signed_in.json()['csrf']}
        response = self.client.post('/workspace/projects', json={'name': 'Customer project'}, headers=self.headers)
        self.assertEqual(response.status_code, 201, response.text)
        self.project = response.json()['id']

    def test_session_restore_and_logout(self):
        response = self.client.get('/account/v1/session')
        self.assertEqual(response.json()['organization'], 'alpha')
        self.assertIn('workspace:manage', response.json()['permissions'])
        self.assertEqual(self.client.post('/account/v1/logout', json={}, headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get('/workspace/projects').status_code, 401)

    def test_mutations_reject_untrusted_origins_and_missing_csrf(self):
        path = '/workspace/projects/' + self.project
        self.assertEqual(self.client.patch(path, json={'status': 'completed'}, headers={'Origin': PORTAL}).status_code, 403)
        self.assertEqual(self.client.patch(path, json={'status': 'completed'}, headers={**self.headers, 'Origin': 'https://evil.example'}).status_code, 403)

    def test_unlisted_login_origin_is_rejected(self):
        self.assertEqual(self.client.post('/account/v1/login', json={'key': self.owner['token']}, headers={'Origin': 'https://evil.example'}).status_code, 403)

    def test_requirements_and_null_configuration_survive_reload(self):
        payload = {'status': 'completed', 'configuration': {'target_score': None, 'selected_file_ids': None},
                   'requirements': {'mode': 'structured', 'component_weights': {'visual_similarity': 60, 'label_balance': 40},
                                    'visual_similarity': {'context': None}, 'label_balance': [{'label': 'test', 'target': 100}], 'notes': ''}}
        response = self.client.patch('/workspace/projects/'+self.project, json=payload, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        detail = self.client.get('/workspace/projects/'+self.project).json()
        self.assertEqual(detail['configuration'], payload['configuration'])
        self.assertIsNone(detail['requirements']['visual_similarity']['context'])
        listing = self.client.get('/workspace/projects').json()['items'][0]
        self.assertEqual(listing['status'], 'completed')
        self.assertEqual(listing['file_count'], 0)
        reopened = RegionalStore(self.path)
        self.assertEqual(reopened.account(reopened.authenticate(self.owner['token']))['organization_name'], 'Alpha')

    def test_selection_cannot_reference_foreign_files(self):
        response = self.client.patch('/workspace/projects/'+self.project, json={'configuration': {'selected_file_ids': ['not-owned']}}, headers=self.headers)
        self.assertEqual(response.status_code, 422)

    def test_tenant_cannot_read_or_change_another_project(self):
        other = self.store.create_organization('beta', 'Beta', 'owner@beta.example')
        token = self.store.accept_invitation(other['invitation_token'])['token']
        headers = {'Authorization': 'Bearer '+token}
        self.assertEqual(self.client.get('/workspace/projects/'+self.project, headers=headers).status_code, 404)
        self.assertEqual(self.client.patch('/workspace/projects/'+self.project, json={'status': 'completed'}, headers=headers).status_code, 404)

    def test_named_upload_keys_are_listed_without_secrets_and_revocable(self):
        path = '/workspace/projects/'+self.project+'/api-keys'
        created = self.client.post(path, json={'name': 'CI upload', 'lifetime_hours': 24}, headers=self.headers)
        self.assertEqual(created.status_code, 201)
        key = created.json()
        listing = self.client.get(path).json()['items']
        self.assertEqual(listing[0]['name'], 'CI upload')
        self.assertNotIn(key['token'], str(listing))
        self.assertEqual(self.client.delete(path+'/'+key['id'], headers=self.headers).status_code, 200)
        files = self.client.get('/workspace/projects/'+self.project+'/files', headers={'Authorization': 'Bearer '+key['token']})
        self.assertEqual(files.status_code, 401)

    def test_grievance_receipt_is_persistent_and_retry_is_idempotent(self):
        body = {'subject': 'A dataset issue', 'category': 'data', 'description': 'The dataset contains unexpected missing rows.', 'project_id': self.project}
        headers = {**self.headers, 'Idempotency-Key': 'support-attempt-1'}
        first = self.client.post('/workspace/grievances', json=body, headers=headers)
        self.assertEqual(first.status_code, 201, first.text)
        retry = self.client.post('/workspace/grievances', json=body, headers=headers)
        self.assertEqual(first.json()['id'], retry.json()['id'])
        self.assertEqual(len(self.client.get('/workspace/grievances').json()['items']), 1)
        body['subject'] = 'Different request'
        self.assertEqual(self.client.post('/workspace/grievances', json=body, headers=headers).status_code, 409)

    def test_grievance_does_not_leak_between_members(self):
        body = {'subject': 'Private grievance', 'category': 'other', 'description': 'A private issue regarding this workspace.'}
        self.client.post('/workspace/grievances', json=body, headers={**self.headers, 'Idempotency-Key': 'private-1'})
        principal = self.store.authenticate(self.owner['token'])
        invitation = self.store.invite(principal, 'second@alpha.example', 'member')
        token = self.store.accept_invitation(invitation['invitation_token'])['token']
        self.assertEqual(self.client.get('/workspace/grievances', headers={'Authorization': 'Bearer '+token}).json()['items'], [])

    def test_project_dispatch_creates_one_real_queue_entry_on_retry(self):
        self.store.add_connection('alpha', 'source')
        self.store.add_profile('technical-v1', 'a'*64)
        payload = {'connection_id': 'source', 'dataset': {'manifest_id': 'b'*32, 'manifest_sha256': 'c'*64},
                   'specification': {'manifest_id': 'd'*32, 'manifest_sha256': 'e'*64}, 'execution_profile': 'technical-v1',
                   'coverage': {'mode': 'all'}, 'budget': {'max_model_calls': 0, 'max_inference_microusd': 0, 'max_decode_frames': 1000}}
        path = '/workspace/projects/'+self.project+'/runs'
        headers = {**self.headers, 'Idempotency-Key': 'dispatch-attempt-1'}
        first = self.client.post(path, json=payload, headers=headers)
        self.assertEqual(first.status_code, 202, first.text)
        retry = self.client.post(path, json=payload, headers=headers)
        self.assertEqual(retry.status_code, 202, retry.text)
        self.assertEqual(first.json()['id'], retry.json()['id'])
        self.assertEqual(len(self.client.get(path).json()['items']), 1)
        self.assertEqual(self.client.get('/v1/dataset-jobs/'+first.json()['id']).status_code, 200)


if __name__ == '__main__':
    unittest.main()
