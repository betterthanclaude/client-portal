"""Local workspace metadata. Uploaded bytes stay beside the workspace database."""
import hashlib
import json
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,created REAL);
                CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,project_id TEXT,email TEXT,status TEXT,
                  token_hash TEXT,created REAL, UNIQUE(project_id,email));
                CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,project_id TEXT,name TEXT,size INTEGER,
                  source TEXT,location TEXT,sha256 TEXT,created REAL,UNIQUE(project_id,source,location));
                CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,project_id TEXT,bucket TEXT,prefix TEXT,region TEXT,created REAL);
                CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,project_id TEXT,token_hash TEXT UNIQUE,expires REAL);
                CREATE TABLE IF NOT EXISTS api_key_details(id TEXT PRIMARY KEY,name TEXT,created REAL,last_used REAL);
                CREATE TABLE IF NOT EXISTS project_details(id TEXT PRIMARY KEY,status TEXT NOT NULL,requirements TEXT,updated REAL);
                CREATE TABLE IF NOT EXISTS project_configuration(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.root / 'workspace.sqlite', timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def project(self, project_id):
        with self.connect() as db:
            row = db.execute("SELECT p.*,COALESCE(d.status,'ongoing') AS status,d.requirements,d.updated FROM projects p LEFT JOIN project_details d ON d.id=p.id WHERE p.id=?", (project_id,)).fetchone()
            if not row:
                return None
            result = dict(row)
            result['requirements'] = json.loads(result['requirements']) if result['requirements'] else None
            config = db.execute('SELECT payload FROM project_configuration WHERE id=?', (project_id,)).fetchone()
            result['configuration'] = json.loads(config['payload']) if config else {'target_score': None, 'selected_file_ids': None}
            return result

    def projects(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute("SELECT p.*,COALESCE(d.status,'ongoing') AS status,d.updated,"
                "(SELECT COUNT(*) FROM files f WHERE f.project_id=p.id) AS file_count,"
                "(SELECT COUNT(*) FROM invitations i WHERE i.project_id=p.id) AS invitation_count "
                "FROM projects p LEFT JOIN project_details d ON d.id=p.id ORDER BY p.created DESC")]

    def create_project(self, name):
        project = dict(id=uuid.uuid4().hex, name=name, created=time.time())
        with self.connect() as db:
            db.execute('INSERT INTO projects VALUES (:id,:name,:created)', project)
        return self.project(project['id'])

    def update_project(self, project_id, changes):
        current = self.project(project_id)
        status = changes.get('status', current['status'])
        requirements = changes.get('requirements', current['requirements'])
        with self.connect() as db:
            db.execute('INSERT INTO project_details VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET '
                       'status=excluded.status,requirements=excluded.requirements,updated=excluded.updated',
                       (project_id, status, json.dumps(requirements), time.time()))
            if 'configuration' in changes:
                db.execute('INSERT INTO project_configuration VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                           (project_id, json.dumps(changes['configuration'])))
        return self.project(project_id)

    def files(self, project_id):
        with self.connect() as db:
            return [dict(row) for row in db.execute('SELECT id,name,size,source,sha256,created FROM files WHERE project_id=? ORDER BY created DESC', (project_id,))]

    def add_file(self, project_id, name, size, source, location, sha256=None):
        item = dict(id=uuid.uuid4().hex, project_id=project_id, name=name, size=size,
                    source=source, location=location, sha256=sha256, created=time.time())
        with self.connect() as db:
            db.execute('INSERT INTO files VALUES (:id,:project_id,:name,:size,:source,:location,:sha256,:created) '
                       'ON CONFLICT(project_id,source,location) DO UPDATE SET size=excluded.size', item)
            saved = dict(db.execute('SELECT id,name,size,source,sha256,created FROM files WHERE project_id=? AND source=? AND location=?',
                                    (project_id, source, location)).fetchone())
        return saved

    def invitations(self, project_id):
        with self.connect() as db:
            return [dict(row) for row in db.execute('SELECT id,email,status,created FROM invitations WHERE project_id=? ORDER BY created', (project_id,))]

    def add_invitation(self, project_id, email):
        token = secrets.token_urlsafe(32)
        item = dict(id=uuid.uuid4().hex, project_id=project_id, email=email, status='pending_delivery',
                    token_hash=hashlib.sha256(token.encode()).hexdigest(), created=time.time())
        with self.connect() as db:
            db.execute('INSERT INTO invitations VALUES (:id,:project_id,:email,:status,:token_hash,:created)', item)
        return {key: item[key] for key in ('id', 'email', 'status', 'created')}, token

    def mark_invitation(self, invitation_id, status):
        with self.connect() as db:
            db.execute('UPDATE invitations SET status=? WHERE id=?', (status, invitation_id))

    def accept_invitation(self, token):
        with self.connect() as db:
            row = db.execute("SELECT id,project_id,created FROM invitations WHERE token_hash=? AND status!='accepted'",
                             (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
            if not row or row['created'] < time.time() - 7 * 86400:
                return None
            db.execute("UPDATE invitations SET status='accepted' WHERE id=?", (row['id'],))
        return self.project(row['project_id'])

    def issue_key(self, project_id, hours, name='Upload key'):
        token = 'knk_' + secrets.token_urlsafe(32)
        key = dict(id=uuid.uuid4().hex, project_id=project_id,
                   token_hash=hashlib.sha256(token.encode()).hexdigest(), expires=time.time() + hours * 3600)
        with self.connect() as db:
            db.execute('INSERT INTO api_keys VALUES (:id,:project_id,:token_hash,:expires)', key)
            db.execute('INSERT INTO api_key_details VALUES (?,?,?,NULL)', (key['id'], name, time.time()))
        return dict(id=key['id'], name=name, token=token, expires=key['expires'], shown_once=True, scope='project_upload')

    def keys(self, project_id):
        with self.connect() as db:
            return [dict(row) for row in db.execute("SELECT k.id,COALESCE(d.name,'Upload key') AS name,"
                "k.expires,d.created,d.last_used FROM api_keys k LEFT JOIN api_key_details d ON d.id=k.id "
                "WHERE k.project_id=? ORDER BY COALESCE(d.created,0) DESC,k.id", (project_id,))]

    def key_allows(self, project_id, token):
        with self.connect() as db:
            row = db.execute('SELECT id,project_id,expires FROM api_keys WHERE token_hash=?',
                             (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
            allowed = bool(row and row['project_id'] == project_id and row['expires'] > time.time())
            if allowed:
                db.execute("INSERT INTO api_key_details VALUES (?,'Upload key',NULL,?) ON CONFLICT(id) DO UPDATE SET last_used=excluded.last_used", (row['id'], time.time()))
        return allowed

    def add_connection(self, project_id, bucket, prefix, region):
        connection = dict(id=uuid.uuid4().hex, project_id=project_id, bucket=bucket,
                          prefix=prefix, region=region, created=time.time())
        with self.connect() as db:
            db.execute('INSERT INTO connections VALUES (:id,:project_id,:bucket,:prefix,:region,:created)', connection)
        return connection
