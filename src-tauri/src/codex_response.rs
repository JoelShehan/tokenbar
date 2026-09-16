use serde_json::{json, Value};

fn optional_number(value: &Value, max: f64, integer: bool) -> Result<Value, String> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    let n = value
        .as_f64()
        .filter(|n| n.is_finite() && *n >= 0.0 && *n <= max && (!integer || n.fract() == 0.0))
        .ok_or("Invalid Codex usage response")?;
    Ok(json!(n))
}

fn window(value: &Value) -> Result<Value, String> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    if !value.is_object() || value["usedPercent"].is_null() {
        return Err("Invalid Codex usage response".into());
    }
    Ok(json!({
        "usedPercent": optional_number(&value["usedPercent"], 100.0, false)?,
        "windowDurationMins": optional_number(&value["windowDurationMins"], 525600.0, true)?,
        "resetsAt": optional_number(&value["resetsAt"], 253402300799.0, true)?,
    }))
}

pub fn limits(value: Value) -> Result<Value, String> {
    let bucket = value
        .pointer("/rateLimitsByLimitId/codex")
        .filter(|v| !v.is_null())
        .unwrap_or(&value["rateLimits"]);
    if !bucket.is_object() {
        return Err("Invalid Codex usage response".into());
    }
    let plan = bucket["planType"].as_str().filter(|s| {
        matches!(
            *s,
            "free" | "go" | "plus" | "pro" | "team" | "business" | "enterprise" | "edu" | "unknown"
        )
    });
    Ok(json!({"rateLimits": {
        "primary": window(&bucket["primary"])?, "secondary": window(&bucket["secondary"])?, "planType": plan
    }}))
}

pub fn activity(value: Value) -> Result<Value, String> {
    if !value.is_object() {
        return Err("Invalid Codex usage response".into());
    }
    let summary = &value["summary"];
    if !summary.is_null() && !summary.is_object() {
        return Err("Invalid Codex usage response".into());
    }
    Ok(json!({"summary": {
        "lifetimeTokens": optional_number(&summary["lifetimeTokens"], super::security::MAX_SAFE_INTEGER as f64, true)?,
        "peakDailyTokens": optional_number(&summary["peakDailyTokens"], super::security::MAX_SAFE_INTEGER as f64, true)?
    }}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_values_are_rejected_and_private_fields_removed() {
        assert!(limits(json!({"rateLimits":{"primary":{"usedPercent":-1}}})).is_err());
        assert!(activity(json!({"summary":{"lifetimeTokens":"secret"}})).is_err());
        assert!(limits(Value::Null).is_err());
        let result = limits(json!({"accountId":"private", "rateLimits":{"primary":{"usedPercent":25},"credits":{"secret":"hidden"}}})).unwrap();
        assert!(result.get("accountId").is_none());
        assert!(result["rateLimits"].get("credits").is_none());
        let result = activity(
            json!({"summary":{"lifetimeTokens":123},"dailyUsageBuckets":[{"private":true}]}),
        )
        .unwrap();
        assert!(result.get("dailyUsageBuckets").is_none());
    }
}
