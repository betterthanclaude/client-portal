"""Loopback-only intake service. QC execution remains owned by DATA-INGEST."""
import hashlib
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import uuid
from email.message import EmailMessage
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .store import Store


class ProjectBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value or any(ord(char) < 32 for char in value):
            raise ValueError('Enter a project name without control characters.')
        return value


class InvitationBody(BaseModel):
    email: str = Field(max_length=254)

    @field_validator('email')
    @classmethod
    def clean_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
            raise ValueError('Enter a valid email address.')
        return value


class KeyBody(BaseModel):
    lifetime_hours: int = Field(default=24, ge=1, le=720)
    name: str = Field(default='Upload key', min_length=1, max_length=80)

    @field_validator('name')
    @classmethod
    def key_name(cls, value):
        return ProjectBody.clean_name(value)


class ComponentWeights(BaseModel):
    model_config = ConfigDict(extra='forbid')
    visual_similarity: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    label_balance: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)


class VisualWeights(BaseModel):
    model_config = ConfigDict(extra='forbid')
    context: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    temporal: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    layout: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    family: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    scene: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)


class LabelTarget(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    target: float = Field(ge=0, le=100, allow_inf_nan=False)


class RequirementsBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['structured', 'notes'] = 'structured'
    component_weights: ComponentWeights = Field(default_factory=ComponentWeights)
    visual_similarity: VisualWeights = Field(default_factory=VisualWeights)
    label_balance: list[LabelTarget] = Field(default_factory=list, max_length=50)
    notes: str = Field(default='', max_length=10000)

    @model_validator(mode='after')
    def valid_label_targets(self):
        labels = [item.label.strip().lower() for item in self.label_balance]
        if any(not label for label in labels) or len(set(labels)) != len(labels) or sum(item.target for item in self.label_balance) > 100.000001:
            raise ValueError('Use unique labels with target percentages totaling at most 100.')
        return self


class ConfigurationBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    target_score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    selected_file_ids: list[str] | None = Field(default=None, max_length=10000)


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: Literal['ongoing', 'completed'] | None = None
    requirements: RequirementsBody | None = None
    configuration: ConfigurationBody | None = None


class S3Body(BaseModel):
    model_config = ConfigDict(extra='forbid')
    bucket_url: str = Field(min_length=1, max_length=2048)
    region: str = Field(default='us-east-1', pattern=r'^[a-z]{2}(?:-[a-z]+)+-\d$')
    access_key_id: SecretStr
    secret_access_key: SecretStr
    session_token: SecretStr | None = None

    @field_validator('access_key_id', 'secret_access_key')
    @classmethod
    def required_credentials(cls, value):
        if not value.get_secret_value().strip():
            raise ValueError('Provide S3 credentials.')
        return value


def send_invitation(email, project_name, link):
    host = os.environ.get('KANOOK_SMTP_HOST')
    sender = os.environ.get('KANOOK_SMTP_FROM')
    if not host or not sender:
        return 'pending_delivery'
    message = EmailMessage()
    message['From'], message['To'] = sender, email
    message['Subject'] = f'Join {project_name} on Kanook'
    message.set_content(f'You have been invited to {project_name}.\n\nOpen your invitation: {link}\n\nThis invitation expires in 7 days.')
    try:
        with smtplib.SMTP(host, int(os.environ.get('KANOOK_SMTP_PORT', '587')), timeout=15) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            user = os.environ.get('KANOOK_SMTP_USER')
            if user:
                smtp.login(user, os.environ.get('KANOOK_SMTP_PASSWORD', ''))
            smtp.send_message(message)
        return 'sent'
    except (OSError, smtplib.SMTPException):
        return 'delivery_failed'


def create_app(root=None, service_token=None, s3_factory=None, mailer=None):
    store = Store(root or os.environ.get('KANOOK_DATA_ROOT', Path(__file__).resolve().parents[1] / '.local'))
    key_file = store.root / 'service.key'
    if service_token is None:
        if not key_file.exists():
            key_file.write_text(secrets.token_urlsafe(40), encoding='utf-8')
        service_token = key_file.read_text(encoding='utf-8').strip()
    app = FastAPI(title='Kanook local intake', docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', 'testserver'])
    app.state.store = store
    app.state.s3_sessions = {}
    app.state.s3_factory = s3_factory or boto3.client
    app.state.mailer = mailer or send_invitation
    app.state.max_upload = int(os.environ.get('KANOOK_MAX_UPLOAD_BYTES', 512 * 1024 * 1024))

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, error):
        # Never echo rejected S3 credentials into a response or access log.
        return JSONResponse({'detail': 'Check the required fields and try again.'}, status_code=422)

    @app.middleware('http')
    async def boundary(request, call_next):
        origin = request.headers.get('origin')
        if origin and origin.rstrip('/') not in os.environ.get('KANOOK_ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174').split(','):
            return JSONResponse({'detail': 'Origin not allowed.'}, status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    def require_local(request):
        if not secrets.compare_digest(request.headers.get('x-kanook-service', ''), service_token):
            raise HTTPException(401, 'Workspace authentication required.')

    def require_project(request, project_id, allow_key=False):
        header = request.headers.get('authorization', '')
        if allow_key and header.startswith('Bearer ') and store.key_allows(project_id, header[7:]):
            return
        require_local(request)
        if not store.project(project_id):
            raise HTTPException(404, 'Project not found.')

    @app.get('/workspace/health')
    def health(request: Request):
        require_local(request)
        return {'ok': True, 'mail_configured': bool(os.environ.get('KANOOK_SMTP_HOST') and os.environ.get('KANOOK_SMTP_FROM'))}

    @app.get('/workspace/projects')
    def projects(request: Request):
        require_local(request)
        return {'items': store.projects()}

    @app.post('/workspace/projects', status_code=201)
    def create_project(body: ProjectBody, request: Request):
        require_local(request)
        return store.create_project(body.name)

    @app.get('/workspace/projects/{project_id}')
    def project(project_id: str, request: Request):
        require_project(request, project_id)
        return {**store.project(project_id), 'members': store.invitations(project_id), 'files': store.files(project_id)}

    @app.patch('/workspace/projects/{project_id}')
    def update_project(project_id: str, body: ProjectUpdate, request: Request):
        require_project(request, project_id)
        if body.configuration and body.configuration.selected_file_ids is not None:
            known = {item['id'] for item in store.files(project_id)}
            if not set(body.configuration.selected_file_ids) <= known:
                raise HTTPException(422, 'Select files belonging to this project.')
        changes = {key: value.model_dump() if isinstance(value, BaseModel) else value
                   for key in body.model_fields_set if (value := getattr(body, key)) is not None}
        return store.update_project(project_id, changes)

    @app.post('/workspace/projects/{project_id}/invitations', status_code=201)
    def invite(project_id: str, body: InvitationBody, request: Request):
        require_project(request, project_id)
        try:
            invitation, token = store.add_invitation(project_id, body.email)
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'This person already has an invitation.') from None
        base = os.environ.get('KANOOK_PUBLIC_URL', 'http://localhost:5174').rstrip('/')
        link = f'{base}/?invitation={token}'
        invitation['status'] = app.state.mailer(body.email, store.project(project_id)['name'], link)
        store.mark_invitation(invitation['id'], invitation['status'])
        return {**invitation, 'invitation_url': link}

    @app.post('/workspace/invitations/accept')
    def accept(body: dict, request: Request):
        require_local(request)
        token = body.get('token')
        if not isinstance(token, str) or len(token) > 128:
            raise HTTPException(422, 'Invalid invitation.')
        project = store.accept_invitation(token)
        if not project:
            raise HTTPException(404, 'Invitation not found or expired.')
        return project

    @app.post('/workspace/projects/{project_id}/api-keys', status_code=201)
    def issue_key(project_id: str, body: KeyBody, request: Request):
        require_project(request, project_id)
        return store.issue_key(project_id, body.lifetime_hours, body.name)

    @app.get('/workspace/projects/{project_id}/api-keys')
    def project_keys(project_id: str, request: Request):
        require_project(request, project_id)
        return {'items': store.keys(project_id)}

    @app.get('/workspace/projects/{project_id}/files')
    def files(project_id: str, request: Request):
        require_project(request, project_id, allow_key=True)
        return {'items': store.files(project_id)}

    @app.post('/workspace/projects/{project_id}/files', status_code=201)
    async def upload(project_id: str, request: Request, filename: str):
        require_project(request, project_id, allow_key=True)
        if not filename or len(filename) > 255 or any(c in filename for c in '/\\\x00') or filename in ('.', '..'):
            raise HTTPException(422, 'Invalid filename.')
        folder = store.root / 'uploads' / project_id
        folder.mkdir(parents=True, exist_ok=True)
        suffix = Path(filename).suffix.lower()
        target = folder / (uuid.uuid4().hex + (suffix if re.fullmatch(r'\.[a-z0-9]{1,10}', suffix) else ''))
        size, digest = 0, hashlib.sha256()
        try:
            with target.open('xb') as output:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > app.state.max_upload:
                        raise HTTPException(413, 'File exceeds the upload size limit.')
                    digest.update(chunk)
                    await run_in_threadpool(output.write, chunk)
            if size == 0:
                raise HTTPException(422, 'Empty files cannot be uploaded.')
            return store.add_file(project_id, filename, size, 'device', str(target.relative_to(store.root)), digest.hexdigest())
        except BaseException:
            target.unlink(missing_ok=True)
            raise

    register_s3(app, store, require_project)
    return app


def register_s3(app, store, require_project):
    def index_page(project_id, session, cursor=None):
        options = {'Bucket': session['bucket'], 'Prefix': session['prefix'], 'MaxKeys': 1000}
        if cursor:
            options['ContinuationToken'] = cursor
        try:
            result = session['client'].list_objects_v2(**options)
        except (BotoCoreError, ClientError):
            raise HTTPException(400, 'S3 could not be read. Check the bucket, region, credentials, and ListBucket permission.') from None
        items = [item for item in result.get('Contents', []) if not item['Key'].endswith('/')]
        for item in items:
            store.add_file(project_id, item['Key'], item['Size'], 's3', f"s3://{session['bucket']}/{item['Key']}")
        return {'indexed': len(items), 'next_cursor': result.get('NextContinuationToken')}

    @app.post('/workspace/projects/{project_id}/s3', status_code=201)
    def connect(project_id: str, body: S3Body, request: Request):
        require_project(request, project_id)
        parsed = urlparse(body.bucket_url.strip())
        if parsed.scheme != 's3' or not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', parsed.netloc) or parsed.query or parsed.fragment:
            raise HTTPException(422, 'Use an S3 URL such as s3://my-bucket/prefix/.')
        client = app.state.s3_factory('s3', region_name=body.region,
            aws_access_key_id=body.access_key_id.get_secret_value(),
            aws_secret_access_key=body.secret_access_key.get_secret_value(),
            aws_session_token=body.session_token.get_secret_value() if body.session_token else None,
            config=Config(connect_timeout=5, read_timeout=15, retries={'max_attempts': 1}))
        session = {'client': client, 'bucket': parsed.netloc, 'prefix': parsed.path.lstrip('/')}
        result = index_page(project_id, session)
        connection = store.add_connection(project_id, session['bucket'], session['prefix'], body.region)
        app.state.s3_sessions[(project_id, connection['id'])] = session
        return {**connection, **result}

    @app.post('/workspace/projects/{project_id}/s3/{connection_id}/index')
    def next_page(project_id: str, connection_id: str, body: dict, request: Request):
        require_project(request, project_id)
        session = app.state.s3_sessions.get((project_id, connection_id))
        if not session:
            raise HTTPException(409, 'Reconnect this bucket to continue indexing after a service restart.')
        cursor = body.get('cursor')
        if not isinstance(cursor, str) or not 1 <= len(cursor) <= 4096:
            raise HTTPException(422, 'Invalid continuation token.')
        return index_page(project_id, session, cursor)
