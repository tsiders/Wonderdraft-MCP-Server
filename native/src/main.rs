mod error;
#[path = "vendor/fastlz.rs"]
mod fastlz;
#[path = "vendor/gcpf.rs"]
mod gcpf;
#[path = "vendor/value.rs"]
mod value;
#[path = "vendor/variant.rs"]
mod variant;
pub use error::{Error, Result};
use serde_json::{Value as Json, json};
use std::{
    fs,
    io::{self, Read},
    path::Path,
};
pub use value::{ByteSource, Value};

fn field<'a>(r: &'a Json, k: &str) -> Result<&'a str> {
    r.get(k)
        .and_then(Json::as_str)
        .ok_or_else(|| Error::format(format!("Missing string field {k}")))
}
fn index(r: &Json, k: &str) -> Result<usize> {
    r.get(k)
        .and_then(Json::as_u64)
        .and_then(|v| usize::try_from(v).ok())
        .ok_or_else(|| Error::format(format!("Missing nonnegative integer {k}")))
}
fn simple(v: &Value) -> Json {
    match v {
        Value::Nil => Json::Null,
        Value::Bool(b) => json!(b),
        Value::Int(i) => json!(i),
        Value::Real(n) => json!(n),
        Value::String(s) => json!(s),
        Value::Vector { kind, values } => json!({"type":kind,"values":values}),
        Value::Array(a) => json!({"type":"Array","count":a.len()}),
        Value::Dictionary(d) => json!({"type":"Dictionary","count":d.len()}),
        Value::PoolByteArray(b) => json!({"type":"PoolByteArray","bytes":b.len()}),
        _ => json!({"type":"GodotVariant"}),
    }
}
fn labels(root: &Value) -> Result<&[Value]> {
    root.get("labels")
        .and_then(Value::as_array)
        .ok_or_else(|| Error::format("Map has no labels array"))
}
fn label_json(i: usize, v: &Value) -> Json {
    let mut j = serde_json::Map::new();
    j.insert("index".into(), json!(i));
    if let Some(d) = v.as_dict() {
        for (k, v) in d {
            if let Some(k) = k.as_str() {
                j.insert(k.into(), simple(v));
            }
        }
    }
    Json::Object(j)
}
fn load(path: &Path, scratch: &Path) -> Result<Value> {
    if !path.is_absolute() {
        return Err(Error::format("Map path must be absolute"));
    }
    let size = fs::metadata(path)
        .map_err(|e| Error::format(e.to_string()))?
        .len();
    if size > 512 * 1024 * 1024 {
        return Err(Error::format("Map exceeds 512 MiB limit"));
    }
    let mut f = fs::File::open(path).map_err(|e| Error::format(e.to_string()))?;
    let mut h = [0; 16];
    f.read_exact(&mut h)
        .map_err(|e| Error::format(e.to_string()))?;
    if &h[..4] != b"GCPF" || u32::from_le_bytes(h[12..16].try_into().unwrap()) > 512 * 1024 * 1024 {
        return Err(Error::format(
            "Unsupported map container or expanded map exceeds 512 MiB",
        ));
    }
    gcpf::decompress_file(path, scratch, |_, _| {})?;
    variant::decode_file(scratch)
}
fn save_new(root: &Value, output: &Path) -> Result<()> {
    if !output.is_absolute()
        || output.extension().and_then(|x| x.to_str()) != Some("wonderdraft_map")
    {
        return Err(Error::format(
            "Output must be an absolute .wonderdraft_map path",
        ));
    }
    if output.exists() {
        return Err(Error::format(
            "Output already exists; overwriting is prohibited",
        ));
    }
    let parent = output
        .parent()
        .ok_or_else(|| Error::format("Output needs a parent directory"))?;
    let tmp = tempfile::tempdir_in(parent).map_err(|e| Error::format(e.to_string()))?;
    let map = tmp.path().join("map.wonderdraft_map");
    variant::save_map(root, &map, 65536, true)?;
    // Validate the completed copy before atomically publishing with no replacement.
    let _ = load(&map, &tmp.path().join("verify.variant"))?;
    fs::hard_link(&map, output)
        .map_err(|e| Error::format(format!("Could not publish exclusive output: {e}")))?;
    Ok(())
}
fn run(r: Json) -> Result<Json> {
    let op = field(&r, "op")?;
    let path = Path::new(field(&r, "path")?);
    let temp = tempfile::tempdir().map_err(|e| Error::format(e.to_string()))?;
    let mut root = load(path, &temp.path().join("map.variant"))?;
    match op {
        "inspect" => {
            let d = root
                .as_dict()
                .ok_or_else(|| Error::format("Map root is not a dictionary"))?;
            let mut metadata = serde_json::Map::new();
            for (k, v) in d {
                if let Some(k) = k.as_str() {
                    metadata.insert(k.into(), simple(v));
                }
            }
            Ok(json!({"path":path,"metadata":metadata}))
        }
        "list_labels" => Ok(
            json!({"labels":labels(&root)?.iter().enumerate().map(|(i,v)| label_json(i,v)).collect::<Vec<_>>() }),
        ),
        "rename_label" | "add_label" => {
            let text = field(&r, "text")?;
            if text.len() > 16384 {
                return Err(Error::format("Label text exceeds 16 KiB"));
            }
            let records = root
                .get_mut("labels")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| Error::format("Map has no labels array"))?;
            let changed_index;
            if op == "rename_label" {
                changed_index = index(&r, "label_index")?;
                let label = records
                    .get_mut(changed_index)
                    .ok_or_else(|| Error::format("Label index out of range"))?;
                if label.as_dict().is_none() {
                    return Err(Error::format("Label is not a dictionary"));
                }
                label.set("text", Value::String(text.into()));
            } else {
                let mut label = records
                    .get(index(&r, "template_index")?)
                    .ok_or_else(|| Error::format("Template index out of range"))?
                    .clone();
                if label.as_dict().is_none() {
                    return Err(Error::format("Template label is not a dictionary"));
                }
                let xy: Vec<f32> = ["x", "y"]
                    .iter()
                    .map(|k| {
                        r.get(k)
                            .and_then(Json::as_f64)
                            .filter(|n| n.is_finite() && n.abs() <= 1e7)
                            .map(|n| n as f32)
                            .ok_or_else(|| Error::format(format!("Invalid coordinate {k}")))
                    })
                    .collect::<Result<_>>()?;
                label.set("text", Value::String(text.into()));
                label.set(
                    "position",
                    Value::Vector {
                        kind: "Vector2".into(),
                        values: xy,
                    },
                );
                changed_index = records.len();
                records.push(label);
            }
            let changed = label_json(changed_index, &records[changed_index]);
            let output = Path::new(field(&r, "output")?);
            save_new(&root, output)?;
            Ok(json!({"output":output,"label":changed}))
        }
        _ => Err(Error::format("Unknown operation")),
    }
}
fn main() {
    let mut input = String::new();
    let response = match io::stdin().take(1024 * 1024).read_to_string(&mut input) {
        Ok(_) => match serde_json::from_str(&input)
            .map_err(|e| Error::format(e.to_string()))
            .and_then(run)
        {
            Ok(result) => json!({"ok":true,"result":result}),
            Err(e) => json!({"ok":false,"error":e.to_string()}),
        },
        Err(e) => json!({"ok":false,"error":e.to_string()}),
    };
    println!("{response}");
}

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn official_map_label_roundtrip_preserves_other_data_and_refuses_overwrite() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/treasure.wonderdraft_map");
        if !fixture.exists() {
            eprintln!("Official fixture absent; run tests/verify.py with a map path");
            return;
        }
        let temp = tempfile::tempdir().unwrap();
        let first = temp.path().join("renamed.wonderdraft_map");
        let original_bytes = fs::read(&fixture).unwrap();
        let output = run(json!({"op":"rename_label","path":fixture,"output":first,"label_index":0,"text":"MCP test — 港"})).unwrap();
        assert_eq!(output["label"]["text"], "MCP test — 港");
        let listed = run(json!({"op":"list_labels","path":first})).unwrap();
        assert_eq!(listed["labels"][0]["text"], "MCP test — 港");
        let mut changed = load(&first, &temp.path().join("changed.variant")).unwrap();
        let original = load(&fixture, &temp.path().join("original.variant")).unwrap();
        changed.get_mut("labels").unwrap().as_array_mut().unwrap()[0].set(
            "text",
            original.get("labels").unwrap().as_array().unwrap()[0]
                .get("text")
                .unwrap()
                .clone(),
        );
        let mut a = Vec::new();
        let mut b = Vec::new();
        variant::write_value(&mut a, &original).unwrap();
        variant::write_value(&mut b, &changed).unwrap();
        assert_eq!(a, b, "Unrelated Godot data must remain unchanged");
        assert!(run(json!({"op":"rename_label","path":fixture,"output":first,"label_index":0,"text":"overwrite"})).is_err());
        let second = temp.path().join("added.wonderdraft_map");
        run(json!({"op":"add_label","path":fixture,"output":second,"template_index":0,"text":"New town","x":500,"y":600})).unwrap();
        let listed = run(json!({"op":"list_labels","path":second})).unwrap();
        assert_eq!(listed["labels"].as_array().unwrap().len(), 2);
        assert_eq!(
            listed["labels"][1]["position"]["values"],
            json!([500.0, 600.0])
        );
        assert_eq!(
            original_bytes,
            fs::read(&fixture).unwrap(),
            "Input must never be changed"
        );
    }
}
