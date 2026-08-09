const structuredRedactions = [
    [/(\b(?:mongodb(?:\+srv)?|https?|wss?):\/\/)[^\s/]+@/gi, "$1[redacted]@"],
    [/(\bauthorization\s*[:=]\s*["']?(?:basic|bearer)\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]"],
    [/(\b(?:auth|twoFactorAuth)\s*=\s*)(?:"[^"]*"|'[^']*'|[^;,\s]+)/gi, "$1[redacted]"],
    [/(["'](?:auth|twoFactorAuth)["']\s*:\s*)(?:"[^"]*"|'[^']*'|[^,}\s]+)/gi, '$1"[redacted]"'],
    [/(\b(?:auth|twoFactorAuth)\s*:\s*)(?:"[^"]*"|'[^']*'|[^,}\s]+)/gi, '$1"[redacted]"'],
    [/(\b(?:MONGODB_URI|VRCHAT_SESSION_ENCRYPTION_KEY)\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s]+)/g, "$1[redacted]"],
    [/([?&](?:password|passwd|token|access_token|api[_-]?key)=)[^&\s]+/gi, "$1[redacted]"],
];

/** Redact exact known values first, then common structured secret forms. */
export function redactSecrets(value, knownSecrets = []) {
    let redacted = String(value);
    const secrets = [...new Set(knownSecrets.filter((secret) => typeof secret === "string" && secret.length >= 4))].sort((left, right) => right.length - left.length);
    for (const secret of secrets) redacted = redacted.split(secret).join("[redacted]");
    for (const [pattern, replacement] of structuredRedactions) redacted = redacted.replace(pattern, replacement);
    return redacted;
}

export function redactOperatorSecrets(value) {
    return redactSecrets(value, [process.env.MONGODB_URI, process.env.VRCHAT_SESSION_ENCRYPTION_KEY]);
}
