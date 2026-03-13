use hex::encode as hex_encode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiError {
    code: String,
    message: String,
    detail: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    trace_id: Option<String>,
}

impl ApiError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: None,
            trace_id: None,
        }
    }

    fn with_detail(mut self, detail: Value) -> Self {
        self.detail = Some(detail);
        self
    }
}

impl From<std::io::Error> for ApiError {
    fn from(value: std::io::Error) -> Self {
        ApiError::new("SAVE_IO_ERROR", value.to_string())
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(value: serde_json::Error) -> Self {
        ApiError::new("SAVE_IO_ERROR", value.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveMeta {
    slot: u16,
    kind: String,
    title: String,
    #[serde(alias = "sceneTitle")]
    scene_title: String,
    timestamp: i64,
    #[serde(alias = "playTimeSec")]
    play_time_sec: u64,
    #[serde(alias = "screenshotRef")]
    screenshot_ref: Option<String>,
    #[serde(alias = "snapshotHash")]
    snapshot_hash: String,
    #[serde(alias = "snapshotVersion")]
    snapshot_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveMetaInput {
    title: String,
    #[serde(alias = "sceneTitle")]
    scene_title: String,
    timestamp: i64,
    #[serde(alias = "playTimeSec")]
    play_time_sec: u64,
    #[serde(alias = "screenshotRef")]
    screenshot_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSnapshot {
    #[serde(alias = "snapshotVersion")]
    snapshot_version: String,
    #[serde(alias = "contractVersion")]
    contract_version: String,
    #[serde(alias = "buildId")]
    build_id: String,
    #[serde(alias = "createdAt")]
    created_at: i64,
    checksum: String,
    engine: Value,
    history: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSnapshotWriteInput {
    slot: u16,
    kind: String,
    meta: SaveMetaInput,
    snapshot: RuntimeSnapshot,
    encoding: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSnapshotWriteOutput {
    meta: SaveMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSnapshotLoadInput {
    slot: u16,
    kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSnapshotLoadOutput {
    meta: SaveMeta,
    snapshot: RuntimeSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveManifest {
    #[serde(alias = "contractVersion")]
    contract_version: String,
    #[serde(alias = "snapshotVersion")]
    snapshot_version: String,
    #[serde(alias = "updatedAt")]
    updated_at: i64,
    slots: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    #[serde(flatten)]
    meta: SaveMeta,
    #[serde(alias = "dataFile")]
    data_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportSaveInput {
    path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportSaveInput {
    path: String,
    overwrite: Option<bool>,
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, ApiError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| ApiError::new("SAVE_IO_ERROR", e.to_string()))?;

    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, ApiError> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

fn saves_dir(app: &tauri::AppHandle) -> Result<PathBuf, ApiError> {
    let dir = app_data_dir(app)?.join("saves");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn manifest_path(app: &tauri::AppHandle) -> Result<PathBuf, ApiError> {
    Ok(saves_dir(app)?.join("manifest.json"))
}

fn now_ms() -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    now.as_millis() as i64
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), ApiError> {
    let tmp_path = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|s| s.to_str()).unwrap_or("data")
    ));

    {
        let mut file = fs::File::create(&tmp_path)?;
        file.write_all(bytes)?;
        file.flush()?;
        file.sync_all()?;
    }

    match fs::rename(&tmp_path, path) {
        Ok(_) => Ok(()),
        Err(_) => {
            if path.exists() {
                let _ = fs::remove_file(path);
            }
            fs::rename(&tmp_path, path)?;
            Ok(())
        }
    }
}

fn load_manifest(app: &tauri::AppHandle) -> Result<SaveManifest, ApiError> {
    let path = manifest_path(app)?;
    if !path.exists() {
        return Ok(SaveManifest {
            contract_version: "2.0.0".to_string(),
            snapshot_version: "2.0.0".to_string(),
            updated_at: now_ms(),
            slots: vec![],
        });
    }

    let raw = fs::read_to_string(path)?;
    let parsed: SaveManifest = serde_json::from_str(&raw)?;
    Ok(parsed)
}

fn save_manifest(app: &tauri::AppHandle, manifest: &SaveManifest) -> Result<(), ApiError> {
    let path = manifest_path(app)?;
    let data = serde_json::to_vec_pretty(manifest)?;
    atomic_write(&path, &data)
}

fn checksum_snapshot(snapshot: &RuntimeSnapshot) -> Result<String, ApiError> {
    let payload = serde_json::json!({
        "engine": snapshot.engine,
        "history": snapshot.history,
        "createdAt": snapshot.created_at,
        "buildId": snapshot.build_id,
    });
    let bytes = serde_json::to_vec(&payload)?;
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    Ok(hex_encode(hasher.finalize()))
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<Value, ApiError> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({
            "audio": { "master": 1.0, "bgm": 0.8, "voice": 0.8, "sfx": 0.8, "mute": false },
            "text": { "fontFamily": "Sarasa UI SC", "fontSize": 28, "lineHeight": 1.5, "textSpeed": 32, "autoDelayMs": 1200 },
            "transition": { "enabled": true, "speedRate": 1.0 },
            "input": { "keymap": {
                "engine.next": { "code": "Space" },
                "save.quick": { "code": "KeyS", "ctrl": true },
                "load.quick": { "code": "KeyL", "ctrl": true },
                "engine.auto.toggle": { "code": "KeyA" }
            }},
            "system": { "skipReadOnly": false, "autoModeInterruptOnChoice": true }
        }));
    }

    let raw = fs::read_to_string(path)?;
    let val: Value = serde_json::from_str(&raw)?;
    Ok(val)
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Value) -> Result<(), ApiError> {
    let path = settings_path(&app)?;
    let bytes = serde_json::to_vec_pretty(&settings)?;
    atomic_write(&path, &bytes)
}

#[tauri::command]
fn list_save_slots(app: tauri::AppHandle) -> Result<Vec<SaveMeta>, ApiError> {
    let manifest = load_manifest(&app)?;
    Ok(manifest.slots.into_iter().map(|s| s.meta).collect())
}

#[tauri::command]
fn save_snapshot(
    app: tauri::AppHandle,
    input: SaveSnapshotWriteInput,
) -> Result<SaveSnapshotWriteOutput, ApiError> {
    let mut snapshot = input.snapshot.clone();
    let checksum = checksum_snapshot(&snapshot)?;
    snapshot.checksum = checksum.clone();

    let ext = if input.encoding == "bin" {
        "bin"
    } else {
        "json"
    };
    let data_file = format!("{}_{}.{}", input.kind, input.slot, ext);
    let data_path = saves_dir(&app)?.join(&data_file);

    let bytes = if ext == "bin" {
        serde_json::to_vec(&snapshot)?
    } else {
        serde_json::to_vec_pretty(&snapshot)?
    };
    atomic_write(&data_path, &bytes)?;

    let meta = SaveMeta {
        slot: input.slot,
        kind: input.kind,
        title: input.meta.title,
        scene_title: input.meta.scene_title,
        timestamp: input.meta.timestamp,
        play_time_sec: input.meta.play_time_sec,
        screenshot_ref: input.meta.screenshot_ref,
        snapshot_hash: checksum,
        snapshot_version: snapshot.snapshot_version,
    };

    let mut manifest = load_manifest(&app)?;
    manifest.updated_at = now_ms();

    if let Some(existing) = manifest
        .slots
        .iter_mut()
        .find(|it| it.meta.slot == meta.slot && it.meta.kind == meta.kind)
    {
        *existing = ManifestEntry {
            meta: meta.clone(),
            data_file: data_file.clone(),
        };
    } else {
        manifest.slots.push(ManifestEntry {
            meta: meta.clone(),
            data_file: data_file.clone(),
        });
    }

    save_manifest(&app, &manifest)?;
    Ok(SaveSnapshotWriteOutput { meta })
}

#[tauri::command]
fn load_snapshot(
    app: tauri::AppHandle,
    input: SaveSnapshotLoadInput,
) -> Result<SaveSnapshotLoadOutput, ApiError> {
    let manifest = load_manifest(&app)?;
    let entry = manifest
        .slots
        .iter()
        .find(|it| {
            it.meta.slot == input.slot
                && match &input.kind {
                    Some(kind) => it.meta.kind == *kind,
                    None => true,
                }
        })
        .ok_or_else(|| ApiError::new("SAVE_NOT_FOUND", "存档不存在"))?
        .clone();

    let data_path = saves_dir(&app)?.join(entry.data_file);
    if !data_path.exists() {
        return Err(ApiError::new("SAVE_NOT_FOUND", "存档文件不存在"));
    }

    let bytes = fs::read(data_path)?;
    let snapshot: RuntimeSnapshot = serde_json::from_slice(&bytes)?;
    let expected = checksum_snapshot(&snapshot)?;
    if expected != entry.meta.snapshot_hash {
        return Err(
            ApiError::new("SAVE_CHECKSUM_MISMATCH", "存档校验失败").with_detail(
                serde_json::json!({
                    "expected": entry.meta.snapshot_hash,
                    "actual": expected,
                }),
            ),
        );
    }

    Ok(SaveSnapshotLoadOutput {
        meta: entry.meta,
        snapshot,
    })
}

#[tauri::command]
fn delete_save_slot(
    app: tauri::AppHandle,
    slot: u16,
    kind: Option<String>,
) -> Result<(), ApiError> {
    let mut manifest = load_manifest(&app)?;

    let to_remove: Vec<ManifestEntry> = manifest
        .slots
        .iter()
        .filter(|it| {
            it.meta.slot == slot && kind.as_ref().map(|k| *k == it.meta.kind).unwrap_or(true)
        })
        .cloned()
        .collect();

    manifest.slots.retain(|it| {
        !(it.meta.slot == slot && kind.as_ref().map(|k| *k == it.meta.kind).unwrap_or(true))
    });

    for entry in to_remove {
        let path = saves_dir(&app)?.join(entry.data_file);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }

    manifest.updated_at = now_ms();
    save_manifest(&app, &manifest)
}

#[tauri::command]
fn export_save(app: tauri::AppHandle, input: ExportSaveInput) -> Result<String, ApiError> {
    let manifest = load_manifest(&app)?;
    let saves_dir = saves_dir(&app)?;

    let mut snapshot_map = HashMap::<String, Value>::new();
    for entry in &manifest.slots {
        let path = saves_dir.join(&entry.data_file);
        if path.exists() {
            if entry.data_file.ends_with(".bin") {
                let raw = fs::read(path)?;
                let mut hasher = Sha256::new();
                hasher.update(&raw);
                let digest = hex_encode(hasher.finalize());
                snapshot_map.insert(
                    entry.data_file.clone(),
                    serde_json::json!({
                        "kind": "bin_ref",
                        "sha256": digest,
                        "size": raw.len(),
                    }),
                );
            } else {
                let raw = fs::read_to_string(path)?;
                let value: Value = serde_json::from_str(&raw).unwrap_or(Value::String(raw));
                snapshot_map.insert(entry.data_file.clone(), value);
            }
        }
    }

    let bundle = serde_json::json!({
        "manifest": manifest,
        "snapshots": snapshot_map,
    });

    let output = PathBuf::from(&input.path);
    let bytes = serde_json::to_vec_pretty(&bundle)?;
    atomic_write(&output, &bytes)?;
    Ok(input.path)
}

#[tauri::command]
fn import_save(app: tauri::AppHandle, input: ImportSaveInput) -> Result<Vec<SaveMeta>, ApiError> {
    let path = PathBuf::from(input.path);
    if !path.exists() {
        return Err(ApiError::new("SAVE_NOT_FOUND", "导入文件不存在"));
    }

    let raw = fs::read_to_string(path)?;
    let bundle: Value = serde_json::from_str(&raw)?;

    let manifest_val = bundle
        .get("manifest")
        .ok_or_else(|| ApiError::new("SAVE_IO_ERROR", "导入包缺少 manifest"))?
        .clone();
    let imported_manifest: SaveManifest = serde_json::from_value(manifest_val)?;

    let snapshots = bundle
        .get("snapshots")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut current = load_manifest(&app)?;
    let overwrite = input.overwrite.unwrap_or(true);
    let dir = saves_dir(&app)?;

    for entry in imported_manifest.slots {
        let exists_index = current
            .slots
            .iter()
            .position(|it| it.meta.slot == entry.meta.slot && it.meta.kind == entry.meta.kind);

        if exists_index.is_some() && !overwrite {
            continue;
        }

        if let Some(data) = snapshots.get(&entry.data_file) {
            if data
                .as_object()
                .and_then(|it| it.get("kind"))
                .and_then(|it| it.as_str())
                == Some("bin_ref")
            {
                continue;
            }
            let path = dir.join(&entry.data_file);
            let bytes = serde_json::to_vec_pretty(data)?;
            atomic_write(&path, &bytes)?;
        }

        if let Some(idx) = exists_index {
            current.slots[idx] = entry;
        } else {
            current.slots.push(entry);
        }
    }

    current.updated_at = now_ms();
    save_manifest(&app, &current)?;

    Ok(current.slots.into_iter().map(|it| it.meta).collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            list_save_slots,
            save_snapshot,
            load_snapshot,
            delete_save_slot,
            export_save,
            import_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
