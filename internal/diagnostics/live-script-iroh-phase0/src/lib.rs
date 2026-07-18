use std::str::FromStr;

use iroh::{Endpoint, NodeAddr, NodeId, RelayUrl};
use wasm_bindgen::prelude::*;

const LIVE_SCRIPT_ALPN: &[u8] = b"dialogforge/live-script/1";
const MAX_FRAME_BYTES: usize = 64 * 1024;

fn browser_error(error: impl std::fmt::Display) -> JsValue {
    js_sys::Error::new(&error.to_string()).into()
}

#[wasm_bindgen]
pub async fn exchange_frame(
    node_id: String,
    relay_url: String,
    frame: Vec<u8>,
) -> Result<Vec<u8>, JsValue> {
    if frame.len() > MAX_FRAME_BYTES {
        return Err(browser_error("phase-0 frame exceeds 64 KiB"));
    }

    let node_id = NodeId::from_str(&node_id).map_err(browser_error)?;
    let relay_url = RelayUrl::from_str(&relay_url).map_err(browser_error)?;
    let instructor = NodeAddr::new(node_id).with_relay_url(relay_url);
    let endpoint = Endpoint::builder().bind().await.map_err(browser_error)?;
    let connection = endpoint
        .connect(instructor, LIVE_SCRIPT_ALPN)
        .await
        .map_err(browser_error)?;
    let (mut send, mut receive) = connection.open_bi().await.map_err(browser_error)?;

    send.write_all(&frame).await.map_err(browser_error)?;
    send.finish().map_err(browser_error)?;

    let echoed = receive
        .read_to_end(MAX_FRAME_BYTES)
        .await
        .map_err(browser_error)?;

    connection.close(0u32.into(), b"phase-0 complete");
    endpoint.close().await;

    Ok(echoed)
}
