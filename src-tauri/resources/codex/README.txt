TokenBar bundles the unmodified OpenAI Codex 0.161.0 Windows x64 executable
from the official npm package @openai/codex@0.161.0-win32-x64.
Source: https://github.com/openai/codex/tree/rust-v0.161.0
License: Apache-2.0. See LICENSE and NOTICE beside this file.
SHA-256: a0f89acca07a511734cac7fddee26b2106fab68918717bc90df16104a0760a30

Only the executable needed for account sign-in and read-only usage requests
is distributed. TokenBar does not start coding sessions, voice features, or
agent tools. Authentication uses an isolated TokenBar CODEX_HOME and the OS
credential store. Run scripts/prepare-codex.ps1 before building Windows.
