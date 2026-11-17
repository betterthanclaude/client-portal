import { useEffect, useRef, useState, type FormEvent } from "react";
import { listConnections, type StorageConnection } from "../lib/qc-api";
import { connectBucket, indexBucket, listFiles, uploadFile, type S3Connection, type StoredFile } from "../lib/workspace-api";

const METHODS = [
  { id: "s3", label: "Connect S3", detail: "Import from a bucket" },
  { id: "device", label: "From device", detail: "Choose or drop files" },
  { id: "api", label: "Use API", detail: "Upload programmatically" },
] as const;
const fileId = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export function ProjectUploads({ projectId, onUseApi }: { projectId: string; onUseApi: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("s3");
  const [files, setFiles] = useState<File[]>([]);
  const [stored, setStored] = useState<StoredFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [connection, setConnection] = useState<S3Connection | null>(null);
  const [qcConnections, setQcConnections] = useState<StorageConnection[]>([]);
  const [qcNotice, setQcNotice] = useState<string | null>(null);
  const [qcLoading, setQcLoading] = useState(false);
  const [qcCursor, setQcCursor] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listFiles(projectId).then((result) => { if (active) setStored(result.items); })
      .catch((error) => { if (active) setNotice(message(error)); });
    return () => { active = false; uploadController.current?.abort(); };
  }, [projectId]);

  async function refreshFiles() { setStored((await listFiles(projectId)).items); }

  function selectFiles(picked: FileList | File[]) {
    if (busy) return;
    const valid = Array.from(picked).filter((file) => file.size > 0);
    setFiles((current) => [...new Map([...current, ...valid].map((file) => [fileId(file), file])).values()]);
    setNotice(valid.length !== picked.length ? "Empty files were skipped." : null);
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setNotice(null);
    try {
      const result = await connectBucket(projectId, {
        bucket_url: String(data.get("bucket_url")).trim(), region: String(data.get("region")).trim(),
        access_key_id: String(data.get("access_key_id")).trim(), secret_access_key: String(data.get("secret_access_key")).trim(),
        session_token: String(data.get("session_token") || "").trim() || undefined,
      });
      setConnection(result);
      for (const name of ["access_key_id", "secret_access_key", "session_token"]) (form.elements.namedItem(name) as HTMLInputElement).value = "";
      await refreshFiles();
      setNotice(`${result.indexed} file references added. Files remain in your S3 bucket.${result.next_cursor ? " More files are available below." : ""}`);
    } catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }

  async function loadMore() {
    if (!connection?.next_cursor) return;
    setBusy(true);
    try {
      const result = await indexBucket(projectId, connection.id, connection.next_cursor);
      setConnection({ ...connection, ...result });
      await refreshFiles();
      setNotice(`${result.indexed} more file references added.`);
    } catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }

  async function sendFiles() {
    const controller = new AbortController();
    uploadController.current = controller;
    setBusy(true); setNotice(null);
    let uploaded = 0;
    try {
      for (const file of files) {
        setProgress({ name: file.name, percent: 0 });
        const result = await uploadFile(projectId, file, (percent) => setProgress({ name: file.name, percent }), controller.signal);
        setStored((current) => [result, ...current]);
        setFiles((current) => current.filter((item) => fileId(item) !== fileId(file)));
        uploaded++;
      }
      setNotice(`${uploaded} ${uploaded === 1 ? "file uploaded" : "files uploaded"} to your project.`);
    } catch (error) { setNotice(`${uploaded ? `${uploaded} uploaded. ` : ""}${message(error)}`); }
    finally { setBusy(false); setProgress(null); uploadController.current = null; }
  }

  async function checkQc(after?: string) {
    setQcLoading(true); setQcNotice(null);
    try {
      const result = await listConnections(after);
      setQcConnections((current) => after ? [...current, ...result.items] : result.items);
      setQcCursor(result.next_cursor);
      setQcNotice("Connected to your deployed QC API. Registered storage is shown below.");
    } catch (error) { setQcNotice(message(error)); }
    finally { setQcLoading(false); }
  }

  return (
    <section className="upload-card" aria-labelledby="upload-title">
      <div className="upload-heading"><h2 id="upload-title">Upload files</h2><p>Choose how you’d like to add files to your project.</p></div>
      <div className="upload-methods" role="group" aria-label="Upload method">
        {METHODS.map((item) => <button key={item.id} type="button" aria-pressed={method === item.id} disabled={busy}
          onClick={() => { if (item.id === "api") { onUseApi(); return; } setMethod(item.id); setNotice(null); }}><span>{item.label}</span><small>{item.detail}</small></button>)}
      </div>

      <div hidden={method !== "s3"}>
        <form className="s3-form" onSubmit={(event) => void connect(event)}>
          <label htmlFor="bucket-url">S3 bucket URL</label>
          <input id="bucket-url" name="bucket_url" placeholder="s3://your-bucket/folder/" required disabled={busy} autoComplete="off" />
          <div className="s3-credentials">
            <div><label htmlFor="s3-access">Access key ID</label><input id="s3-access" name="access_key_id" required disabled={busy} autoComplete="off" placeholder="Access key ID" /></div>
            <div><label htmlFor="s3-secret">Secret access key</label><input id="s3-secret" name="secret_access_key" type="password" required disabled={busy} autoComplete="new-password" placeholder="Secret access key" /></div>
          </div>
          <div className="s3-credentials">
            <div><label htmlFor="s3-region">AWS region</label><input id="s3-region" name="region" defaultValue="us-east-1" required disabled={busy} /></div>
            <div><label htmlFor="s3-session">Session token <span>(optional)</span></label><input id="s3-session" name="session_token" type="password" disabled={busy} autoComplete="new-password" placeholder="For temporary credentials" /></div>
          </div>
          <div className="upload-submit-row"><p>Use read-only bucket access. Files stay in S3; credentials are kept only for this service session.</p><button className="brown-btn" type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect bucket"} <span aria-hidden="true">→</span></button></div>
        </form>
        {connection?.next_cursor && <button className="outline-btn more-files" type="button" disabled={busy} onClick={() => void loadMore()}>Import next 1,000 references</button>}
      </div>

      <div hidden={method !== "device"}>
        <div className={dragging ? "device-drop is-dragging" : "device-drop"}
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); selectFiles(event.dataTransfer.files); }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" /></svg>
          <p>Drop files here</p><span>or choose them from your device</span>
          <button type="button" className="outline-btn" disabled={busy} onClick={() => fileInput.current?.click()}>Choose files</button>
          <input ref={fileInput} className="sr" type="file" multiple disabled={busy} aria-label="Choose files from device" tabIndex={-1}
            onChange={(event) => { if (event.target.files) selectFiles(event.target.files); event.target.value = ""; }} />
        </div>
        {files.length > 0 && <>
          <ul className="selected-files" aria-label="Selected files">{files.map((file) => <li key={fileId(file)}><span className="file-name">{file.name}</span><small>{fileSize(file.size)}</small><button type="button" className="remove-file" disabled={busy} aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => fileId(item) !== fileId(file)))}>×</button></li>)}</ul>
          <div className="upload-submit-row"><p>{files.length} {files.length === 1 ? "file" : "files"} selected</p><button type="button" className="brown-btn" disabled={busy} onClick={() => void sendFiles()}>{busy ? "Uploading…" : "Upload files"}</button></div>
        </>}
        {progress && <div className="upload-progress" role="status"><label htmlFor="file-progress">{progress.name} · {progress.percent === 100 ? "Saving…" : `${progress.percent}%`}</label><progress id="file-progress" max={100} value={progress.percent} /><button type="button" className="outline-btn" onClick={() => uploadController.current?.abort()}>Cancel upload</button></div>}
      </div>

      {notice && <p className="upload-notice" role="status">{notice}</p>}
      <div className="project-files"><div className="members-heading"><h3>Project files <span>{stored.length}</span></h3><button type="button" className="text-hit" disabled={busy} onClick={() => void refreshFiles().catch((error) => setNotice(message(error)))}>Refresh</button></div>
        {stored.length === 0 ? <p>Your files will appear here.</p> : <ul className="selected-files" aria-label="Project files">{stored.map((file) => <li key={file.id}><span className="file-name">{file.name}</span><small>{file.source === "s3" ? "S3 reference" : "Uploaded"} · {fileSize(file.size)}</small></li>)}</ul>}
      </div>
      <div className="upload-api-prompt"><span>Prefer to work with code?</span><button type="button" className="outline-btn" disabled={busy} onClick={onUseApi}>Use API <span aria-hidden="true">→</span></button></div>
      <details className="qc-connection"><summary>QC connection</summary><p>Check storage registered with your deployed QC API. Uploading here does not start a QC run.</p><button type="button" className="outline-btn" disabled={qcLoading} onClick={() => void checkQc()}>{qcLoading ? "Checking…" : "Check connection"}</button>
        {qcNotice && <p role="status">{qcNotice}</p>}{qcConnections.map((item) => <p key={item.id}>{item.id}</p>)}{qcCursor && <button type="button" className="outline-btn" disabled={qcLoading} onClick={() => void checkQc(qcCursor)}>Load more connections</button>}
      </details>
    </section>
  );
}
