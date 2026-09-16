use serde::de::DeserializeOwned;
use std::time::Duration;

pub const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Could not initialize secure API connection".into())
}

pub async fn json<T: DeserializeOwned>(mut response: reqwest::Response) -> Result<T, String> {
    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BYTES as u64)
    {
        return Err("API response exceeds size limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read API response")?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err("API response exceeds size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    // Never include response content or serde errors (which can quote input).
    serde_json::from_slice(&bytes).map_err(|_| "Invalid API response".into())
}

pub fn add_tokens(total: i64, value: i64) -> Result<i64, String> {
    if value < 0 {
        return Err("Invalid API token count".into());
    }
    total
        .checked_add(value)
        .filter(|sum| *sum <= MAX_SAFE_INTEGER)
        .ok_or("API token count exceeds supported range".into())
}

pub fn next_page(
    has_more: bool,
    cursor: Option<String>,
    seen: &mut std::collections::HashSet<String>,
) -> Result<Option<String>, String> {
    if !has_more {
        return Ok(None);
    }
    let cursor = cursor
        .filter(|v| !v.is_empty() && v.len() <= 4096)
        .ok_or("Invalid API pagination")?;
    if seen.len() >= 31 || !seen.insert(cursor.clone()) {
        return Err("API pagination limit reached".into());
    }
    Ok(Some(cursor))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_negative_and_overflowing_counts() {
        assert!(add_tokens(0, -1).is_err());
        assert!(add_tokens(MAX_SAFE_INTEGER, 1).is_err());
        assert!(add_tokens(i64::MAX, 1).is_err());
        assert_eq!(add_tokens(5, 7).unwrap(), 12);
    }
    #[test]
    fn rejects_cycles_and_missing_cursors() {
        let mut seen = std::collections::HashSet::new();
        assert!(next_page(true, None, &mut seen).is_err());
        assert!(next_page(true, Some("a".into()), &mut seen).is_ok());
        assert!(next_page(true, Some("b".into()), &mut seen).is_ok());
        assert!(next_page(true, Some("a".into()), &mut seen).is_err());
    }
}
