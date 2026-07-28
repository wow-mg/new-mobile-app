#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="${REPO_PATH:-/workspace/projects/Wondermove-Inc/new-mobile-app}"
REPO_CLONE_URL="${REPO_CLONE_URL:-https://github.com/Wondermove-Inc/new-mobile-app.git}"
CANONICAL_REPO_PATH="${PROJECT_BOOTSTRAP_CANONICAL_REPO_PATH:-/workspace/projects/Wondermove-Inc/new-mobile-app}"
CODEX_MANAGED_PATHS="${CODEX_MANAGED_PATHS:-/workspace/CODEX_MANAGED_PATHS.md}"
STATE_DIR="${STATE_DIR:-/workspace/state}"
IDENTITY_PATH="${IDENTITY_PATH:-/workspace/IDENTITY}"
ROLE_ENV_PATH="${PROJECT_BOOTSTRAP_ROLE_ENV_PATH:-${STATE_DIR}/project-bootstrap-role.env}"
REPORT_PATH="${PROJECT_BOOTSTRAP_AGENT_SETUP_REPORT_PATH:-${STATE_DIR}/project-bootstrap-agent-setup-report.json}"
PREFLIGHT_SCRIPT="${PROJECT_BOOTSTRAP_PREFLIGHT_SCRIPT:-/workspace/skills/project-bootstrap/scripts/project-bootstrap-preflight.sh}"
CODEX_CLI_PRECHECK="${CODEX_CLI_PRECHECK:-/workspace/skills/codex-cli-auth-setup/scripts/codex-cli-precheck.sh}"
STITCH_ADC_PRECHECK="${STITCH_ADC_PRECHECK:-/workspace/skills/stitch-adc-setup/scripts/stitch-adc-precheck.sh}"
EAS_ROBOT_AUTH_PRECHECK="${EAS_ROBOT_AUTH_PRECHECK:-/workspace/skills/eas-robot-auth-setup/scripts/eas-robot-auth-precheck.sh}"
STITCH_ADC_REPORT="${STITCH_ADC_REPORT:-${STATE_DIR}/stitch-adc-setup-report.json}"
EAS_ROBOT_AUTH_REPORT="${EAS_ROBOT_AUTH_REPORT:-${STATE_DIR}/eas-robot-auth-setup-report.json}"
GIT_IDENTITY_PATH="${PROJECT_BOOTSTRAP_GIT_IDENTITY_PATH:-}"
AGENT_TOOL_BIN_DIR="${PROJECT_BOOTSTRAP_AGENT_TOOL_BIN_DIR:-${STATE_DIR}/project-bootstrap-tools/bin}"
RAILWAY_INSTALLER_PATH="${PROJECT_BOOTSTRAP_RAILWAY_INSTALLER_PATH:-}"
GCLOUD_INSTALLER_PATH="${PROJECT_BOOTSTRAP_GCLOUD_INSTALLER_PATH:-}"
INSTALL_APPROVED="${PROJECT_BOOTSTRAP_INSTALL_APPROVED:-false}"
SKILLS_ROOT="${PROJECT_BOOTSTRAP_SKILLS_ROOT:-/workspace/skills}"
WORKSPACE_AGENTS_PATH="${PROJECT_BOOTSTRAP_WORKSPACE_AGENTS_PATH:-/workspace/AGENTS.md}"
WORKSPACE_WORKFLOW_PATH="${PROJECT_BOOTSTRAP_WORKSPACE_WORKFLOW_PATH:-/workspace/WORKFLOW.md}"
WORKSPACE_HEARTBEAT_PATH="${PROJECT_BOOTSTRAP_WORKSPACE_HEARTBEAT_PATH:-/workspace/HEARTBEAT.md}"
WORKSPACE_TOOLS_PATH="${PROJECT_BOOTSTRAP_WORKSPACE_TOOLS_PATH:-/workspace/TOOLS.md}"
REPO_SOURCE_PATH="${PROJECT_BOOTSTRAP_REPO_SOURCE_PATH:-${REPO_PATH}}"
ORGANIZATIONS_SOURCE_PATH="${PROJECT_BOOTSTRAP_ORGANIZATIONS_SOURCE_PATH:-${REPO_SOURCE_PATH%/}/mobile-app-dev-team/runtime-sources/organizations/ORGANIZATIONS.md}"
WORKSPACE_ORGANIZATIONS_PATH="${PROJECT_BOOTSTRAP_WORKSPACE_ORGANIZATIONS_PATH:-/workspace/ORGANIZATIONS.md}"
OPENCLAW_POD_SKILLS_SYNC_REPORT_PATH="${OPENCLAW_POD_SKILLS_SYNC_REPORT_PATH:-${STATE_DIR}/openclaw-pod-skills-sync-report.json}"
OPENCLAW_POD_SKILLS_SYNC="${OPENCLAW_POD_SKILLS_SYNC:-${SKILLS_ROOT%/}/openclaw-pod-skills-sync/scripts/sync-pod-skills.sh}"
HUMAN_PRESENT="${PROJECT_BOOTSTRAP_HUMAN_PRESENT:-false}"
CREDENTIAL_FILE_EXPLORER_OPEN="${PROJECT_BOOTSTRAP_OPEN_CREDENTIAL_FILE_EXPLORER:-false}"

redact() {
  sed -E 's/(token|key|secret|password|credential)([=: ][^ ]+)/\1=***REDACTED***/Ig'
}

normalize_role() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's#[[:space:]_/]+#-#g; s#^-+##; s#-+$##'
}

is_canonical_role() {
  case "$1" in
    product-planning|design|mobile-architect|mobile-app-dev|backend-api-integrator|qa-release)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_exact_canonical_role_value() {
  local value="$1"
  local normalized
  normalized="$(normalize_role "${value}")"
  [[ "${value}" == "${normalized}" ]] && is_canonical_role "${normalized}"
}

role_from_soul_path() {
  case "$(basename "$1")" in
    product-planning-soul.md) printf 'product-planning' ;;
    design-soul.md) printf 'design' ;;
    mobile-architect-soul.md) printf 'mobile-architect' ;;
    mobile-app-dev-soul.md) printf 'mobile-app-dev' ;;
    backend-api-integrator-soul.md) printf 'backend-api-integrator' ;;
    qa-release-soul.md) printf 'qa-release' ;;
    *) return 1 ;;
  esac
}

role_from_selector() {
  local selector
  selector="$(normalize_role "$1")"
  case "${selector}" in
    *product-planning*|*product*planning*) printf 'product-planning' ;;
    *mobile-architect*) printf 'mobile-architect' ;;
    *mobile-app-dev*|*app-dev*) printf 'mobile-app-dev' ;;
    *backend-api-integrator*|*backend*api*) printf 'backend-api-integrator' ;;
    *qa-release*|*release*) printf 'qa-release' ;;
    *design*) printf 'design' ;;
    *) return 1 ;;
  esac
}

role_surface_conflicts() {
  local selected_role="$1"
  local configured_value="$2"
  local configured_role

  if [[ -z "${configured_value}" ]]; then
    return 1
  fi

  configured_role="$(normalize_role "${configured_value}")"
  if [[ "${configured_value}" != "${configured_role}" ]] || ! is_canonical_role "${configured_role}"; then
    return 0
  fi

  [[ "${configured_role}" != "${selected_role}" ]]
}

resolve_agent_role() {
  local candidate=""
  local explicit_role=""

  if [[ -n "${PROJECT_BOOTSTRAP_ROLE_SLUG:-}" ]]; then
    explicit_role="$(normalize_role "${PROJECT_BOOTSTRAP_ROLE_SLUG}")"
    if [[ "${PROJECT_BOOTSTRAP_ROLE_SLUG}" != "${explicit_role}" ]] || ! is_canonical_role "${explicit_role}"; then
      printf '%s\n' "blocked_explicit_role_slug_invalid"
      return 2
    fi

    if role_surface_conflicts "${explicit_role}" "${WM_ROLE:-}" \
      || role_surface_conflicts "${explicit_role}" "${WM_EXPECTED_ROLE:-}"; then
      printf '%s\n' "blocked_explicit_role_slug_conflict"
      return 2
    fi

    if [[ -r "${IDENTITY_PATH}" ]]; then
      candidate="$(head -n 1 "${IDENTITY_PATH}" | tr -d '\r')"
      if role_surface_conflicts "${explicit_role}" "${candidate}"; then
        printf '%s\n' "blocked_explicit_role_slug_conflict"
        return 2
      fi
    fi

    printf '%s\n' "${explicit_role}"
    return 0
  fi

  for candidate in "${WM_ROLE:-}" "${WM_EXPECTED_ROLE:-}"; do
    if [[ -n "${candidate}" ]]; then
      if ! is_exact_canonical_role_value "${candidate}"; then
        printf '%s\n' "blocked_role_surface_noncanonical"
        return 2
      fi
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  if [[ -r "${IDENTITY_PATH}" ]]; then
    candidate="$(head -n 1 "${IDENTITY_PATH}" | tr -d '\r')"
    if [[ -n "${candidate}" ]]; then
      if ! is_exact_canonical_role_value "${candidate}"; then
        printf '%s\n' "blocked_role_surface_noncanonical"
        return 2
      fi
      printf '%s\n' "${candidate}"
      return 0
    fi
  fi

  return 1
}

write_role_identity() {
  local role="$1"
  mkdir -p "$(dirname "${IDENTITY_PATH}")" "$(dirname "${ROLE_ENV_PATH}")"
  printf '%s\n' "${role}" > "${IDENTITY_PATH}"
  {
    printf 'export WM_ROLE=%q\n' "${role}"
    printf 'export WM_EXPECTED_ROLE=%q\n' "${role}"
  } > "${ROLE_ENV_PATH}"
}

managed_path_status="not_checked"

repair_managed_path_registry() {
  local managed_path="${REPO_PATH%/}/"
  local canonical_path="${CANONICAL_REPO_PATH%/}/"

  if [[ "${managed_path}" != "${canonical_path}" ]]; then
    managed_path_status="blocked_wrong_repo_path"
    return
  fi

  mkdir -p "$(dirname "${CODEX_MANAGED_PATHS}")"

  if [[ ! -e "${CODEX_MANAGED_PATHS}" ]]; then
    {
      printf '# Codex-managed Paths\n\n'
      printf 'Add repository or directory paths here. Any task targeting these paths must be executed through Codex CLI.\n\n'
    } > "${CODEX_MANAGED_PATHS}"
  fi

  if ! grep -Fx -- "- ${managed_path}" "${CODEX_MANAGED_PATHS}" >/dev/null 2>&1; then
    printf '%s\n' "- ${managed_path}" >> "${CODEX_MANAGED_PATHS}"
    managed_path_status="repaired"
  else
    managed_path_status="present"
  fi
}

mcp_configured() {
  local name="$1"
  codex mcp list 2> >(redact >&2) | grep -Eq "(^|[[:space:]])${name}([[:space:]]|$)"
}

register_mcp() {
  local name="$1"
  if ! command -v codex >/dev/null 2>&1; then
    printf '%s\n' "codex_cli_missing"
    return
  fi

  if mcp_configured "${name}"; then
    printf '%s\n' "already_configured"
    return
  fi

  case "${name}" in
    mobile-mcp)
      codex mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp@0.0.58 2> >(redact >&2) >/dev/null
      ;;
    serena)
      codex mcp add serena -- uvx -p 3.13 --from git+https://github.com/oraios/serena@v1.5.3 serena start-mcp-server --project-from-cwd --context=codex 2> >(redact >&2) >/dev/null
      ;;
    stitch)
      codex mcp add stitch -- npx -y stitch-mcp@1.3.2 2> >(redact >&2) >/dev/null
      ;;
    expo)
      codex mcp add expo --url https://mcp.expo.dev/mcp 2> >(redact >&2) >/dev/null
      ;;
    atlassian)
      codex mcp add atlassian -- npx -y mcp-remote@0.1.38 https://mcp.atlassian.com/v1/mcp 2> >(redact >&2) >/dev/null
      ;;
    playwright)
      codex mcp add playwright -- npx -y @executeautomation/playwright-mcp-server@1.0.12 2> >(redact >&2) >/dev/null
      ;;
    *)
      printf '%s\n' "unsupported"
      return
      ;;
  esac

  if mcp_configured "${name}"; then
    printf '%s\n' "registered"
  else
    printf '%s\n' "registration_unverified"
  fi
}

check_node_repl_status() {
  if ! command -v codex >/dev/null 2>&1; then
    printf '%s\n' "codex_cli_missing"
    return
  fi

  if mcp_configured node_repl; then
    printf '%s\n' "already_configured"
  else
    printf '%s\n' "app_environment_missing"
  fi
}

metadata_status() {
  local target_path="$1"
  if [[ -e "${target_path}" ]]; then
    printf '%s\n' "present"
  else
    printf '%s\n' "missing"
  fi
}

has_token_bearing_clone_url() {
  [[ "${REPO_CLONE_URL}" =~ ://[^/[:space:]]+@ ]] || [[ "${REPO_CLONE_URL}" =~ (token|password|secret|key)= ]]
}

ensure_repo_checkout() {
  if [[ -d "${REPO_PATH}" ]]; then
    printf '%s\n' "present"
    return
  fi
  if [[ -z "${REPO_CLONE_URL}" || "$(has_token_bearing_clone_url && printf yes || printf no)" == "yes" ]]; then
    printf '%s\n' "blocked"
    return
  fi
  mkdir -p "$(dirname "${REPO_PATH}")"
  if git clone "${REPO_CLONE_URL}" "${REPO_PATH}" 2> >(redact >&2) >/dev/null; then
    printf '%s\n' "cloned"
  else
    printf '%s\n' "clone_failed"
  fi
}

workspace_skill_status() {
  local slug="$1"
  if [[ -f "${SKILLS_ROOT%/}/${slug}/SKILL.md" ]]; then
    printf '%s\n' "present"
  else
    printf '%s\n' "missing"
  fi
}

seed_openclaw_pod_skills_sync() {
  local source_dir="${REPO_SOURCE_PATH%/}/mobile-app-dev-team/runtime-sources/skills/openclaw-pod-skills-sync"
  local target_dir="${SKILLS_ROOT%/}/openclaw-pod-skills-sync"
  if [[ -x "${OPENCLAW_POD_SKILLS_SYNC}" ]]; then
    printf '%s\n' "present"
    return
  fi
  if [[ ! -f "${source_dir}/SKILL.md" || ! -x "${source_dir}/scripts/sync-pod-skills.sh" ]]; then
    printf '%s\n' "missing_source"
    return
  fi
  mkdir -p "${SKILLS_ROOT%/}"
  rm -rf "${target_dir}"
  if cp -R "${source_dir}" "${target_dir}" 2> >(redact >&2) && [[ -x "${OPENCLAW_POD_SKILLS_SYNC}" ]]; then
    printf '%s\n' "seeded"
  else
    printf '%s\n' "blocked"
  fi
}

run_workspace_skills_sync() {
  local seed_status
  seed_status="$(seed_openclaw_pod_skills_sync)"
  if [[ "${seed_status}" == "missing_source" || "${seed_status}" == "blocked" ]]; then
    printf '%s\n' "${seed_status}"
    return
  fi
  if OPENCLAW_POD_SKILLS_SOURCE_ROOT="${REPO_SOURCE_PATH%/}/mobile-app-dev-team/runtime-sources/skills" \
    OPENCLAW_POD_SKILLS_ROOT="${SKILLS_ROOT%/}" \
    OPENCLAW_WORKSPACE_AGENTS_PATH="${WORKSPACE_AGENTS_PATH}" \
    OPENCLAW_WORKSPACE_WORKFLOW_PATH="${WORKSPACE_WORKFLOW_PATH}" \
    OPENCLAW_WORKSPACE_HEARTBEAT_PATH="${WORKSPACE_HEARTBEAT_PATH}" \
    OPENCLAW_WORKSPACE_TOOLS_PATH="${WORKSPACE_TOOLS_PATH}" \
    OPENCLAW_ORGANIZATIONS_SOURCE_PATH="${ORGANIZATIONS_SOURCE_PATH}" \
    OPENCLAW_WORKSPACE_ORGANIZATIONS_PATH="${WORKSPACE_ORGANIZATIONS_PATH}" \
    OPENCLAW_ROLE_SLUG="${resolved_role}" \
    OPENCLAW_EXPECTED_ROLE_SLUG="${resolved_role}" \
    OPENCLAW_POD_SKILLS_SYNC_REPORT_PATH="${OPENCLAW_POD_SKILLS_SYNC_REPORT_PATH}" \
    STATE_DIR="${STATE_DIR}" \
    bash "${OPENCLAW_POD_SKILLS_SYNC}" 2> >(redact >&2) >/dev/null; then
    printf '%s\n' "completed"
  else
    printf '%s\n' "blocked"
  fi
}

workspace_agents_file_status() {
  if [[ -s "${WORKSPACE_AGENTS_PATH}" ]]; then
    printf '%s\n' "present"
  else
    printf '%s\n' "missing"
  fi
}

workspace_organizations_guidance_status() {
  if [[ -f "${WORKSPACE_ORGANIZATIONS_PATH}" && -r "${WORKSPACE_ORGANIZATIONS_PATH}" ]]; then
    printf '%s\n' "present"
  elif [[ -e "${WORKSPACE_ORGANIZATIONS_PATH}" ]]; then
    printf '%s\n' "unreadable"
  else
    printf '%s\n' "missing"
  fi
}

file_explorer_command() {
  for candidate in xdg-open gio nautilus; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      printf '%s\n' "${candidate}"
      return
    fi
  done
  printf '%s\n' "unavailable"
}

safe_login_flow() {
  local flow_name="$1"
  shift
  if [[ "${HUMAN_PRESENT}" != "true" ]]; then
    printf '%s\n' "needs_human_present"
    return
  fi

  if "$@" >/dev/null 2> >(redact >&2); then
    printf '%s\n' "${flow_name}_started"
  else
    printf '%s\n' "${flow_name}_failed"
  fi
}

safe_railway_login_flow() {
  if [[ "${HUMAN_PRESENT}" != "true" ]]; then
    printf '%s\n' "needs_human_present"
    return
  fi

  if [[ "$(file_explorer_command)" == "unavailable" ]]; then
    if railway login --browserless >/dev/null 2> >(redact >&2); then
      printf '%s\n' "railway_login_browserless_started"
    else
      printf '%s\n' "railway_login_browserless_failed"
    fi
    return
  fi

  if railway login >/dev/null 2> >(redact >&2); then
    printf '%s\n' "railway_login_started"
  else
    printf '%s\n' "railway_login_failed"
  fi
}

gcloud_auth_status_check() {
  local output
  output="$(gcloud auth list --format='value(account)' 2> >(redact >&2) || true)"
  if printf '%s\n' "${output}" | grep -E '[^[:space:]]' >/dev/null 2>&1 \
    && ! printf '%s\n' "${output}" | grep -Eiq 'no credentialed accounts|not logged in'; then
    printf '%s\n' "available"
  else
    printf '%s\n' "missing"
  fi
}

gcloud_project_status_check() {
  local output
  output="$(gcloud config get-value project 2> >(redact >&2) || true)"
  output="$(printf '%s' "${output}" | tr -d '\r' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ -n "${output}" && "${output}" != "(unset)" ]]; then
    printf '%s\n' "available"
  else
    printf '%s\n' "missing"
  fi
}

safe_version_check() {
  local cli_name="$1"
  if "${cli_name}" --version >/dev/null 2> >(redact >&2); then
    printf '%s\n' "checked"
  else
    printf '%s\n' "failed"
  fi
}

status_command_check() {
  local status_name="$1"
  shift
  if "$@" >/dev/null 2> >(redact >&2); then
    printf '%s\n' "available"
  else
    printf '%s\n' "missing"
  fi
}

record_tool_bin_env() {
  mkdir -p "$(dirname "${ROLE_ENV_PATH}")"
  if [[ ! -e "${ROLE_ENV_PATH}" ]] || ! grep -F 'PROJECT_BOOTSTRAP_AGENT_TOOL_BIN_DIR=' "${ROLE_ENV_PATH}" >/dev/null 2>&1; then
    {
      printf 'export PROJECT_BOOTSTRAP_AGENT_TOOL_BIN_DIR=%q\n' "${AGENT_TOOL_BIN_DIR}"
      printf 'export PATH=%q:${PATH}\n' "${AGENT_TOOL_BIN_DIR}"
    } >> "${ROLE_ENV_PATH}"
  fi
}

ensure_required_cli() {
  local cli_name="$1"
  local installer_path="$2"
  local status_prefix="$3"

  if command -v "${cli_name}" >/dev/null 2>&1; then
    printf -v "${status_prefix}_command_status" '%s' "available"
    printf -v "${status_prefix}_install_decision" '%s' "already_available"
    printf -v "${status_prefix}_installer_status" '%s' "not_needed"
    printf -v "${status_prefix}_version_status" '%s' "$(safe_version_check "${cli_name}")"
    return
  fi

  if [[ -n "${installer_path}" && -x "${installer_path}" ]]; then
    if [[ "${INSTALL_APPROVED}" != "true" ]]; then
      printf -v "${status_prefix}_command_status" '%s' "missing"
      printf -v "${status_prefix}_install_decision" '%s' "install_blocked_needs_approval"
      printf -v "${status_prefix}_installer_status" '%s' "approval_required"
      printf -v "${status_prefix}_version_status" '%s' "not_checked"
      return
    fi
    mkdir -p "${AGENT_TOOL_BIN_DIR}"
    if "${installer_path}" "${AGENT_TOOL_BIN_DIR}" >/dev/null 2> >(redact >&2); then
      export PATH="${AGENT_TOOL_BIN_DIR}:${PATH}"
      record_tool_bin_env
      printf -v "${status_prefix}_install_decision" '%s' "install_attempted"
      printf -v "${status_prefix}_installer_status" '%s' "executed"
      if command -v "${cli_name}" >/dev/null 2>&1; then
        printf -v "${status_prefix}_command_status" '%s' "available"
        printf -v "${status_prefix}_version_status" '%s' "$(safe_version_check "${cli_name}")"
      else
        printf -v "${status_prefix}_command_status" '%s' "missing"
        printf -v "${status_prefix}_version_status" '%s' "not_checked"
      fi
    else
      printf -v "${status_prefix}_command_status" '%s' "missing"
      printf -v "${status_prefix}_install_decision" '%s' "install_failed"
      printf -v "${status_prefix}_installer_status" '%s' "failed"
      printf -v "${status_prefix}_version_status" '%s' "not_checked"
    fi
    return
  fi

  printf -v "${status_prefix}_command_status" '%s' "missing"
  printf -v "${status_prefix}_install_decision" '%s' "install_unavailable_needs_platform_source"
  if [[ -n "${installer_path}" ]]; then
    printf -v "${status_prefix}_installer_status" '%s' "not_executable"
  else
    printf -v "${status_prefix}_installer_status" '%s' "missing"
  fi
  printf -v "${status_prefix}_version_status" '%s' "not_checked"
}

ensure_railway_cli() {
  if command -v railway >/dev/null 2>&1; then
    railway_command_status="available"
    railway_install_decision="already_available"
    railway_installer_status="not_needed"
    railway_version_status="$(safe_version_check railway)"
    return
  fi

  if command -v npm >/dev/null 2>&1; then
    if [[ "${INSTALL_APPROVED}" != "true" ]]; then
      railway_command_status="missing"
      railway_install_decision="install_blocked_needs_approval"
      railway_installer_status="approval_required"
      railway_version_status="not_checked"
      return
    fi
    if npm i -g @railway/cli >/dev/null 2> >(redact >&2); then
      railway_install_decision="npm_global_install_attempted"
      railway_installer_status="executed"
      if command -v railway >/dev/null 2>&1; then
        railway_command_status="available"
        railway_version_status="$(safe_version_check railway)"
      else
        railway_command_status="missing"
        railway_version_status="not_checked"
      fi
    else
      railway_command_status="missing"
      railway_install_decision="npm_global_install_failed"
      railway_installer_status="failed"
      railway_version_status="not_checked"
    fi
    return
  fi

  if [[ -n "${RAILWAY_INSTALLER_PATH}" && -x "${RAILWAY_INSTALLER_PATH}" ]]; then
    ensure_required_cli "railway" "${RAILWAY_INSTALLER_PATH}" "railway"
    return
  fi

  railway_command_status="missing"
  railway_install_decision="install_unavailable_npm_missing"
  railway_installer_status="missing"
  railway_version_status="not_checked"
}

run_status_precheck() {
  local script_path="$1"
  local report_path="$2"
  if [[ -e "${report_path}" ]]; then
    printf '%s\n' "already_present"
    return
  fi
  if [[ ! -x "${script_path}" ]]; then
    printf '%s\n' "script_missing"
    return
  fi
  REPORT_PATH="${report_path}" bash "${script_path}" 2> >(redact >&2) >/dev/null
  if [[ -e "${report_path}" ]]; then
    printf '%s\n' "generated"
  else
    printf '%s\n' "not_generated"
  fi
}

strip_wrapping_quotes() {
  local value="$1"
  value="${value%$'\r'}"
  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value}"
}

load_git_identity_file() {
  local file_path="$1"
  local key value
  [[ -n "${file_path}" && -r "${file_path}" ]] || return 0
  while IFS='=' read -r key value || [[ -n "${key}" ]]; do
    case "${key}" in
      PROJECT_BOOTSTRAP_GIT_USER_NAME|WM_GIT_USER_NAME)
        if [[ "${key}" == "PROJECT_BOOTSTRAP_GIT_USER_NAME" ]]; then
          git_identity_file_project_name="$(strip_wrapping_quotes "${value}")"
        else
          git_identity_file_wm_name="$(strip_wrapping_quotes "${value}")"
        fi
        ;;
      PROJECT_BOOTSTRAP_GIT_USER_EMAIL|WM_GIT_USER_EMAIL)
        if [[ "${key}" == "PROJECT_BOOTSTRAP_GIT_USER_EMAIL" ]]; then
          git_identity_file_project_email="$(strip_wrapping_quotes "${value}")"
        else
          git_identity_file_wm_email="$(strip_wrapping_quotes "${value}")"
        fi
        ;;
    esac
  done < "${file_path}"
}

select_git_identity_pair() {
  local saw_identity="false"
  local project_name project_email wm_name wm_email
  project_name="$(strip_wrapping_quotes "${PROJECT_BOOTSTRAP_GIT_USER_NAME:-}")"
  project_email="$(strip_wrapping_quotes "${PROJECT_BOOTSTRAP_GIT_USER_EMAIL:-}")"
  wm_name="$(strip_wrapping_quotes "${WM_GIT_USER_NAME:-}")"
  wm_email="$(strip_wrapping_quotes "${WM_GIT_USER_EMAIL:-}")"

  if [[ -n "${project_name}" || -n "${project_email}" ]]; then
    saw_identity="true"
    if [[ -n "${project_name}" && -n "${project_email}" ]]; then
      approved_git_name="${project_name}"
      approved_git_email="${project_email}"
      return 0
    fi
  fi

  if [[ -n "${wm_name}" || -n "${wm_email}" ]]; then
    saw_identity="true"
    if [[ -n "${wm_name}" && -n "${wm_email}" ]]; then
      approved_git_name="${wm_name}"
      approved_git_email="${wm_email}"
      return 0
    fi
  fi

  if [[ -n "${git_identity_file_project_name}" || -n "${git_identity_file_project_email}" ]]; then
    saw_identity="true"
    if [[ -n "${git_identity_file_project_name}" && -n "${git_identity_file_project_email}" ]]; then
      approved_git_name="${git_identity_file_project_name}"
      approved_git_email="${git_identity_file_project_email}"
      return 0
    fi
  fi

  if [[ -n "${git_identity_file_wm_name}" || -n "${git_identity_file_wm_email}" ]]; then
    saw_identity="true"
    if [[ -n "${git_identity_file_wm_name}" && -n "${git_identity_file_wm_email}" ]]; then
      approved_git_name="${git_identity_file_wm_name}"
      approved_git_email="${git_identity_file_wm_email}"
      return 0
    fi
  fi

  if [[ "${saw_identity}" == "true" ]]; then
    return 1
  fi
  return 2
}

configure_git_identity() {
  local selection_status
  if ! command -v git >/dev/null 2>&1; then
    printf '%s\n' "git_missing"
    return
  fi

  if git config --get user.name >/dev/null 2>&1 && git config --get user.email >/dev/null 2>&1; then
    printf '%s\n' "already_configured"
    return
  fi

  approved_git_name=""
  approved_git_email=""
  git_identity_file_project_name=""
  git_identity_file_project_email=""
  git_identity_file_wm_name=""
  git_identity_file_wm_email=""
  load_git_identity_file "${GIT_IDENTITY_PATH}"

  selection_status=0
  select_git_identity_pair || selection_status="$?"
  if [[ "${selection_status}" -ne 0 ]]; then
    case "${selection_status}" in
      1)
        printf '%s\n' "partial_approved_source"
        ;;
      *)
        printf '%s\n' "missing_approved_source"
        ;;
    esac
    return
  fi
  if [[ "${approved_git_email}" != *@* ]]; then
    printf '%s\n' "invalid_approved_source"
    return
  fi

  git config --global user.name "${approved_git_name}"
  git config --global user.email "${approved_git_email}"
  if git config --get user.name >/dev/null 2>&1 && git config --get user.email >/dev/null 2>&1; then
    printf '%s\n' "configured_from_approved_source"
  else
    printf '%s\n' "configuration_unverified"
  fi
}

configure_github_auth() {
  if ! command -v gh >/dev/null 2>&1; then
    printf '%s\n' "gh_missing"
    return
  fi

  if ! gh auth status >/dev/null 2> >(redact >&2); then
    printf '%s\n' "missing"
    return
  fi

  if gh auth setup-git >/dev/null 2> >(redact >&2); then
    printf '%s\n' "setup_git_completed"
  else
    printf '%s\n' "setup_git_failed"
  fi
}

mkdir -p "${STATE_DIR}" "$(dirname "${REPORT_PATH}")"

repo_checkout_status="$(ensure_repo_checkout)"
role_status="not_resolved"
resolved_role=""
if resolved_role="$(resolve_agent_role)"; then
  write_role_identity "${resolved_role}"
  role_status="configured"
else
  case "${resolved_role}" in
    blocked_*)
      role_status="${resolved_role}"
      resolved_role=""
      ;;
  esac
fi

workspace_skills_sync_status="$(run_workspace_skills_sync)"
openclaw_pod_skills_sync_skill_status="$(workspace_skill_status openclaw-pod-skills-sync)"
project_bootstrap_skill_status="$(workspace_skill_status project-bootstrap)"
codex_cli_auth_setup_skill_status="$(workspace_skill_status codex-cli-auth-setup)"
pod_role_bootstrap_skill_status="$(workspace_skill_status pod-role-bootstrap)"
eas_robot_auth_setup_skill_status="$(workspace_skill_status eas-robot-auth-setup)"
stitch_adc_setup_skill_status="$(workspace_skill_status stitch-adc-setup)"
codex_role_workflow_skill_status="$(workspace_skill_status codex-role-workflow)"
codex_interactive_repo_work_skill_status="$(workspace_skill_status codex-interactive-repo-work)"
workspace_agents_status="$(workspace_agents_file_status)"
workspace_organizations_status="$(workspace_organizations_guidance_status)"

repair_managed_path_registry

codex_setup_status="not_needed"
if ! command -v codex >/dev/null 2>&1; then
  if [[ -x "${CODEX_CLI_PRECHECK}" ]]; then
    bash "${CODEX_CLI_PRECHECK}" 2> >(redact >&2) >/dev/null || true
    if command -v codex >/dev/null 2>&1; then
      codex_setup_status="available_after_precheck"
    else
      codex_setup_status="missing_after_precheck"
    fi
  else
    codex_setup_status="codex_cli_precheck_missing"
  fi
fi

mobile_mcp_status="$(register_mcp mobile-mcp || printf 'blocked')"
serena_mcp_status="$(register_mcp serena || printf 'blocked')"
stitch_mcp_status="$(register_mcp stitch || printf 'blocked')"
expo_mcp_status="$(register_mcp expo || printf 'blocked')"
atlassian_mcp_status="$(register_mcp atlassian || printf 'blocked')"
node_repl_mcp_status="$(check_node_repl_status || printf 'blocked')"
playwright_mcp_status="$(register_mcp playwright || printf 'blocked')"
expo_mcp_auth_status="missing"
if command -v codex >/dev/null 2>&1; then
  if codex mcp get expo 2> >(redact >&2) | grep -Eiq 'authenticated|connected|authorized|ready'; then
    expo_mcp_auth_status="available"
  elif codex mcp list 2> >(redact >&2) | awk '
    BEGIN { in_expo = 0 }
    /^Name[[:space:]]+Url[[:space:]]+/ { in_expo = 1; next }
    in_expo && /^expo[[:space:]]/ && $0 ~ /enabled/ && $0 ~ /OAuth/ { found = 1 }
    END { exit(found ? 0 : 1) }
  '; then
    expo_mcp_auth_status="available"
  fi
fi

railway_command_status="missing"
railway_install_decision="install_unavailable_needs_platform_source"
railway_installer_status="missing"
railway_version_status="not_checked"
gcloud_command_status="missing"
gcloud_install_decision="install_unavailable_needs_platform_source"
gcloud_installer_status="missing"
gcloud_version_status="not_checked"

ensure_railway_cli
ensure_required_cli "gcloud" "${GCLOUD_INSTALLER_PATH}" "gcloud"

railway_auth_status="not_checked"
railway_login_flow="not_checked"
if [[ "${railway_command_status}" == "available" ]]; then
  railway_auth_status="$(status_command_check railway_auth railway whoami)"
  if [[ "${railway_auth_status}" == "missing" ]]; then
    railway_login_flow="$(safe_railway_login_flow)"
    railway_auth_status="$(status_command_check railway_auth railway whoami)"
  else
    railway_login_flow="not_needed"
  fi
fi

gcloud_project_status="not_checked"
gcloud_auth_status="not_checked"
gcloud_login_flow="not_checked"
gcloud_adc_status="not_checked"
gcloud_adc_login_flow="not_checked"
gcloud_project_command="gcloud config get-value project"
gcloud_project_set_flow="not_checked"
if [[ "${gcloud_command_status}" == "available" ]]; then
  gcloud_auth_status="$(gcloud_auth_status_check)"
  if [[ "${gcloud_auth_status}" == "missing" ]]; then
    gcloud_login_flow="$(safe_login_flow gcloud_auth_login gcloud auth login)"
    gcloud_auth_status="$(gcloud_auth_status_check)"
  else
    gcloud_login_flow="not_needed"
  fi
  gcloud_adc_status="$(status_command_check gcloud_adc test -f "${HOME}/.config/gcloud/application_default_credentials.json")"
  if [[ "${PROJECT_BOOTSTRAP_REQUIRE_GCLOUD_ADC:-false}" == "true" && "${gcloud_adc_status}" == "missing" ]]; then
    gcloud_adc_login_flow="$(safe_login_flow gcloud_adc_login gcloud auth application-default login)"
    gcloud_adc_status="$(status_command_check gcloud_adc test -f "${HOME}/.config/gcloud/application_default_credentials.json")"
  else
    gcloud_adc_login_flow="not_needed"
  fi
  gcloud_project_status="$(gcloud_project_status_check)"
  if [[ "${gcloud_project_status}" == "missing" && -n "${PROJECT_BOOTSTRAP_GCLOUD_PROJECT_ID:-}" ]]; then
    if gcloud config set project "${PROJECT_BOOTSTRAP_GCLOUD_PROJECT_ID}" >/dev/null 2> >(redact >&2); then
      gcloud_project_set_flow="attempted"
      gcloud_project_status="$(gcloud_project_status_check)"
    else
      gcloud_project_set_flow="failed"
    fi
  elif [[ "${gcloud_project_status}" == "available" ]]; then
    gcloud_project_set_flow="not_needed"
  fi
fi

expo_cli_auth_status="not_checked"
if command -v npx >/dev/null 2>&1; then
  if npx --no-install expo whoami >/dev/null 2> >(redact >&2); then
    expo_cli_auth_status="available"
  else
    expo_cli_auth_status="missing"
  fi
else
  expo_cli_auth_status="missing"
fi

railway_credentials_path="${HOME}/.railway"
gcloud_credentials_path="${HOME}/.config/gcloud"
gcloud_adc_path="${HOME}/.config/gcloud/application_default_credentials.json"
github_credentials_path="${HOME}/.config/gh"
expo_credentials_path="${HOME}/.expo"
eas_credentials_path="${HOME}/.eas"
credential_file_explorer="$(file_explorer_command)"

role_requires_stitch="false"
role_requires_eas="false"
case "${resolved_role}" in
  design) role_requires_stitch="true" ;;
  qa-release) role_requires_eas="true" ;;
esac

stitch_report_status="not_applicable"
eas_report_status="not_applicable"
if [[ "${role_requires_stitch}" == "true" ]]; then
  stitch_report_status="$(run_status_precheck "${STITCH_ADC_PRECHECK}" "${STITCH_ADC_REPORT}")"
fi
if [[ "${role_requires_eas}" == "true" ]]; then
  eas_report_status="$(run_status_precheck "${EAS_ROBOT_AUTH_PRECHECK}" "${EAS_ROBOT_AUTH_REPORT}")"
fi

git_identity_status="$(configure_git_identity || printf 'blocked')"
github_auth_status="$(configure_github_auth || printf 'blocked')"

preflight_status="not_run"
if [[ "${PROJECT_BOOTSTRAP_RUN_PREFLIGHT:-0}" == "1" ]]; then
  if [[ -x "${PREFLIGHT_SCRIPT}" ]]; then
    if bash "${PREFLIGHT_SCRIPT}" 2> >(redact >&2) >/dev/null; then
      preflight_status="pass"
    else
      preflight_status="blocked"
    fi
  else
    preflight_status="script_missing"
  fi
fi

node - "$REPORT_PATH" "$resolved_role" "$role_status" "$IDENTITY_PATH" "$ROLE_ENV_PATH" "$CODEX_MANAGED_PATHS" "$REPO_PATH" "$CANONICAL_REPO_PATH" "$managed_path_status" "$codex_setup_status" "$mobile_mcp_status" "$serena_mcp_status" "$stitch_mcp_status" "$expo_mcp_status" "$atlassian_mcp_status" "$node_repl_mcp_status" "$playwright_mcp_status" "$railway_command_status" "$railway_install_decision" "$railway_installer_status" "$railway_version_status" "$railway_auth_status" "$railway_login_flow" "$gcloud_command_status" "$gcloud_install_decision" "$gcloud_installer_status" "$gcloud_version_status" "$gcloud_auth_status" "$gcloud_login_flow" "$gcloud_adc_status" "$gcloud_adc_login_flow" "$gcloud_project_status" "$gcloud_project_command" "$gcloud_project_set_flow" "$AGENT_TOOL_BIN_DIR" "$stitch_report_status" "$eas_report_status" "$git_identity_status" "$github_auth_status" "$preflight_status" "$credential_file_explorer" "$CREDENTIAL_FILE_EXPLORER_OPEN" "$railway_credentials_path" "$(metadata_status "${railway_credentials_path}")" "$gcloud_credentials_path" "$(metadata_status "${gcloud_credentials_path}")" "$gcloud_adc_path" "$(metadata_status "${gcloud_adc_path}")" "$github_credentials_path" "$(metadata_status "${github_credentials_path}")" "$expo_credentials_path" "$(metadata_status "${expo_credentials_path}")" "$eas_credentials_path" "$(metadata_status "${eas_credentials_path}")" "$REPO_CLONE_URL" "$repo_checkout_status" "$SKILLS_ROOT" "$workspace_skills_sync_status" "$OPENCLAW_POD_SKILLS_SYNC_REPORT_PATH" "$openclaw_pod_skills_sync_skill_status" "$project_bootstrap_skill_status" "$codex_cli_auth_setup_skill_status" "$pod_role_bootstrap_skill_status" "$eas_robot_auth_setup_skill_status" "$stitch_adc_setup_skill_status" "$codex_role_workflow_skill_status" "$codex_interactive_repo_work_skill_status" "$WORKSPACE_AGENTS_PATH" "$workspace_agents_status" "$WORKSPACE_ORGANIZATIONS_PATH" "$workspace_organizations_status" "$expo_mcp_auth_status" "$expo_cli_auth_status" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const [
  reportPath,
  resolvedRole,
  roleStatus,
  identityPath,
  roleEnvPath,
  managedPathRegistry,
  repoPath,
  canonicalRepoPath,
  managedPathStatus,
  codexSetupStatus,
  mobileMcpStatus,
  serenaMcpStatus,
  stitchMcpStatus,
  expoMcpStatus,
  atlassianMcpStatus,
  nodeReplMcpStatus,
  playwrightMcpStatus,
  railwayCommandStatus,
  railwayInstallDecision,
  railwayInstallerStatus,
  railwayVersionStatus,
  railwayAuthStatus,
  railwayLoginFlow,
  gcloudCommandStatus,
  gcloudInstallDecision,
  gcloudInstallerStatus,
  gcloudVersionStatus,
  gcloudAuthStatus,
  gcloudLoginFlow,
  gcloudAdcStatus,
  gcloudAdcLoginFlow,
  gcloudProjectStatus,
  gcloudProjectCommand,
  gcloudProjectSetFlow,
  agentToolBinDir,
  stitchReportStatus,
  easReportStatus,
  gitIdentityStatus,
  githubAuthStatus,
  preflightStatus,
  credentialFileExplorer,
  credentialFileExplorerOpen,
  railwayCredentialsPath,
  railwayCredentialsStatus,
  gcloudCredentialsPath,
  gcloudCredentialsStatus,
  gcloudAdcPath,
  gcloudAdcFileStatus,
  githubCredentialsPath,
  githubCredentialsStatus,
  expoCredentialsPath,
  expoCredentialsStatus,
  easCredentialsPath,
  easCredentialsStatus,
  repoCloneUrl,
  repoCheckoutStatus,
  skillsRoot,
  workspaceSkillsSyncStatus,
  workspaceSkillsSyncReportPath,
  openclawPodSkillsSyncSkillStatus,
  projectBootstrapSkillStatus,
  codexCliAuthSetupSkillStatus,
  podRoleBootstrapSkillStatus,
  easRobotAuthSetupSkillStatus,
  stitchAdcSetupSkillStatus,
  codexRoleWorkflowSkillStatus,
  codexInteractiveRepoWorkSkillStatus,
  workspaceAgentsPath,
  workspaceAgentsStatus,
  workspaceOrganizationsPath,
  workspaceOrganizationsStatus,
  expoMcpAuthStatus,
  expoCliAuthStatus,
] = process.argv.slice(2);

function metadataFor(targetPath) {
  const explorerOpenEnabled = credentialFileExplorerOpen === 'true';
  const result = {
    path: targetPath,
    status: fs.existsSync(targetPath) ? 'present' : 'missing',
    contents_checked: false,
    file_explorer: {
      command: credentialFileExplorer === 'unavailable' ? null : credentialFileExplorer,
      open_policy: explorerOpenEnabled ? 'explicitly_enabled' : 'disabled_by_default',
      open_attempted: false,
      open_status: credentialFileExplorer === 'unavailable'
        ? 'not_available'
        : explorerOpenEnabled ? 'not_attempted' : 'disabled',
      fallback: credentialFileExplorer === 'unavailable' || !explorerOpenEnabled ? 'terminal_metadata' : null,
    },
    entries: [],
  };

  if (!fs.existsSync(targetPath)) return result;
  const paths = [];
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    if (explorerOpenEnabled && credentialFileExplorer !== 'unavailable') {
      const openArgs = credentialFileExplorer === 'gio' ? ['open', targetPath] : [targetPath];
      const openResult = spawnSync(credentialFileExplorer, openArgs, { stdio: 'ignore' });
      result.file_explorer.open_attempted = true;
      result.file_explorer.open_status = openResult.status === 0 ? 'opened' : 'failed';
      result.file_explorer.fallback = openResult.status === 0 ? null : 'terminal_metadata';
    }
    for (const name of fs.readdirSync(targetPath)) {
      paths.push(path.join(targetPath, name));
    }
  } else {
    result.file_explorer.open_status = 'not_directory';
    result.file_explorer.fallback = 'terminal_metadata';
    paths.push(targetPath);
  }

  result.entries = paths.map((entryPath) => {
    const entryStat = fs.statSync(entryPath);
    return {
      name: path.basename(entryPath),
      type: entryStat.isDirectory() ? 'directory' : 'file',
      mode: `0${(entryStat.mode & 0o777).toString(8)}`,
      owner: entryStat.uid,
      group: entryStat.gid,
      size: entryStat.size,
      modified: entryStat.mtime.toISOString(),
    };
  });
  return result;
}

const blockers = [];
if (managedPathStatus.startsWith('blocked')) blockers.push(managedPathStatus);
if (repoCheckoutStatus === 'blocked') blockers.push('repo-checkout-blocked');
if (repoCheckoutStatus === 'clone_failed') blockers.push('repo-clone-failed');
if (workspaceSkillsSyncStatus !== 'completed') blockers.push('workspace-skills-sync-blocked');
if (roleStatus === 'not_resolved') blockers.push('missing-role-identity');
if (roleStatus === 'blocked_explicit_role_slug_invalid') blockers.push('explicit-role-slug-invalid');
if (roleStatus === 'blocked_explicit_role_slug_conflict') blockers.push('explicit-role-slug-conflict');
if (roleStatus === 'blocked_role_surface_noncanonical') blockers.push('role-surface-noncanonical');
if (railwayCommandStatus !== 'available') blockers.push('railway-cli-unavailable');
if (gcloudCommandStatus !== 'available') blockers.push('gcloud-cli-unavailable');
if (railwayInstallDecision === 'install_blocked_needs_approval') blockers.push('railway-install-approval-required');
if (gcloudInstallDecision === 'install_blocked_needs_approval') blockers.push('gcloud-install-approval-required');
if (railwayCommandStatus === 'available' && railwayAuthStatus === 'missing') blockers.push('railway-auth-missing');
if (gcloudCommandStatus === 'available' && gcloudAuthStatus === 'missing') blockers.push('gcloud-auth-missing');
if (gcloudCommandStatus === 'available' && gcloudAdcStatus === 'missing') blockers.push('gcloud-adc-missing');
if (expoMcpAuthStatus === 'missing') blockers.push('expo-mcp-auth-missing');
if (expoCliAuthStatus === 'missing') blockers.push('expo-cli-auth-missing');
const setupBlocked = blockers.length > 0;
const railwayMetadata = metadataFor(railwayCredentialsPath);
const gcloudMetadata = metadataFor(gcloudCredentialsPath);
const gcloudAdcMetadata = metadataFor(gcloudAdcPath);
const githubMetadata = metadataFor(githubCredentialsPath);
const expoMetadata = metadataFor(expoCredentialsPath);
const easMetadata = metadataFor(easCredentialsPath);

const report = {
  schema: 'project-bootstrap-agent-setup/v1',
  status: setupBlocked ? 'blocked' : 'completed',
  blockers,
  repo_checkout: {
    clone_url_status: /:\/\/[^/\s]+@/.test(repoCloneUrl) || /(?:token|password|secret|key)=/i.test(repoCloneUrl) ? 'token_bearing_or_rejected' : 'canonical_https',
    local_path: repoPath,
    status: repoCheckoutStatus,
  },
  workspace_skills: {
    root: skillsRoot,
    sync: {
      status: workspaceSkillsSyncStatus,
      report: workspaceSkillsSyncReportPath,
    },
    'openclaw-pod-skills-sync': openclawPodSkillsSyncSkillStatus,
    'project-bootstrap': projectBootstrapSkillStatus,
    'codex-cli-auth-setup': codexCliAuthSetupSkillStatus,
    'pod-role-bootstrap': podRoleBootstrapSkillStatus,
    'eas-robot-auth-setup': easRobotAuthSetupSkillStatus,
    'stitch-adc-setup': stitchAdcSetupSkillStatus,
    'codex-role-workflow': codexRoleWorkflowSkillStatus,
    'codex-interactive-repo-work': codexInteractiveRepoWorkSkillStatus,
  },
  workspace_agents: {
    path: workspaceAgentsPath,
    status: workspaceAgentsStatus,
  },
  guidance_artifacts: {
    workspace_organizations: {
      path: workspaceOrganizationsPath,
      status: workspaceOrganizationsStatus,
      guidance_only: true,
      enforcement: 'not_enforced_by_this_report',
    },
  },
  role: {
    resolved: resolvedRole || 'missing',
    status: roleStatus,
    identity_path: identityPath,
    env_path: roleEnvPath,
  },
  managed_path: {
    registry: managedPathRegistry,
    repo_path: `${repoPath.replace(/\/$/, '')}/`,
    canonical_repo_path: `${canonicalRepoPath.replace(/\/$/, '')}/`,
    status: managedPathStatus,
  },
  codex_cli_setup: codexSetupStatus,
  mcp: {
    mobile_mcp: mobileMcpStatus,
    serena: serenaMcpStatus,
    stitch: stitchMcpStatus,
    expo: expoMcpStatus,
    atlassian: atlassianMcpStatus,
    node_repl: nodeReplMcpStatus,
    playwright: playwrightMcpStatus,
  },
  tool_readiness: {
    node_repl: {
      required: false,
      owner: 'codex_app_plugin_optional',
      status: nodeReplMcpStatus,
      install_decision: nodeReplMcpStatus === 'already_configured' ? 'already_available' : 'app_environment_owned',
      minimum_user_action: 'None. node_repl is optional Codex app/plugin inventory and does not block project-bootstrap.',
    },
    railway: {
      required: true,
      owner: 'agent_with_approved_installer_then_human_auth',
      command_status: railwayCommandStatus,
      install_decision: railwayInstallDecision,
      installer_status: railwayInstallerStatus,
      version_status: railwayVersionStatus,
      auth_status: railwayAuthStatus,
      login_flow: railwayLoginFlow,
      tool_bin_dir: agentToolBinDir,
      minimum_user_action: railwayCommandStatus === 'available'
        ? 'If Railway auth is missing, I will run railway login and you complete Railway sign-in in the browser. Do not send secrets in chat.'
        : 'npm is required so I can run npm i -g @railway/cli. After install, I will run railway login and you complete Railway sign-in in the browser; do not send secrets in chat.',
    },
    gcloud: {
      required: true,
      owner: 'agent_with_approved_installer_then_human_auth',
      command_status: gcloudCommandStatus,
      install_decision: gcloudInstallDecision,
      installer_status: gcloudInstallerStatus,
      version_status: gcloudVersionStatus,
      auth_status: gcloudAuthStatus,
      login_flow: gcloudLoginFlow,
      adc_status: gcloudAdcStatus,
      adc_login_flow: gcloudAdcLoginFlow,
      project_status: gcloudProjectStatus,
      project_command: gcloudProjectCommand,
      project_set_flow: gcloudProjectSetFlow,
      tool_bin_dir: agentToolBinDir,
      minimum_user_action: gcloudCommandStatus === 'available'
        ? 'If Google auth, ADC, or project selection is missing, I will run gcloud auth login, gcloud auth application-default login when needed, and gcloud config set project <project-id> after you provide the non-secret project id. Do not send ADC JSON or service account JSON in chat.'
        : 'Provide or approve an approved official Google Cloud CLI installer source. After install, I will run gcloud auth login, gcloud auth application-default login when needed, and gcloud config set project <project-id> after you provide the non-secret project id; do not send ADC JSON or service account JSON in chat.',
    },
    expo_mcp: {
      required: true,
      owner: 'target_codex_session_oauth',
      auth_status: expoMcpAuthStatus,
    },
    expo_cli: {
      required: true,
      owner: 'workspace_expo_cli_login',
      auth_status: expoCliAuthStatus,
    },
  },
  install_plan: [
    railwayInstallDecision === 'install_blocked_needs_approval'
      ? { tool: 'railway', package: '@railway/cli', command: 'npm i -g @railway/cli', approval_required: true }
      : null,
    gcloudInstallDecision === 'install_blocked_needs_approval'
      ? { tool: 'gcloud', package: 'google-cloud-cli', command: 'approved Google Cloud CLI installer', approval_required: true }
      : null,
  ].filter(Boolean),
  installed_exact: [
    railwayInstallDecision === 'npm_global_install_attempted' &&
      railwayInstallerStatus === 'executed' &&
      railwayCommandStatus === 'available'
      ? { tool: 'railway', package: '@railway/cli', command: 'npm i -g @railway/cli' }
      : null,
    railwayInstallDecision === 'install_attempted' &&
      railwayInstallerStatus === 'executed' &&
      railwayCommandStatus === 'available'
      ? { tool: 'railway', command: 'approved railway installer' }
      : null,
    gcloudInstallDecision === 'install_attempted' &&
      gcloudInstallerStatus === 'executed' &&
      gcloudCommandStatus === 'available'
      ? { tool: 'gcloud', package: 'google-cloud-cli', command: 'approved Google Cloud CLI installer' }
      : null,
  ].filter(Boolean),
  credential_storage: {
    railway: {
      path: railwayCredentialsPath,
      status: railwayCredentialsStatus,
      metadata: railwayMetadata,
      file_explorer: railwayMetadata.file_explorer,
      contents_checked: false,
      proof: 'metadata-only path/status; credential contents are never read',
    },
    gcloud: {
      path: gcloudCredentialsPath,
      status: gcloudCredentialsStatus,
      metadata: gcloudMetadata,
      file_explorer: gcloudMetadata.file_explorer,
      adc_path: gcloudAdcPath,
      adc_file_status: gcloudAdcFileStatus,
      adc_metadata: gcloudAdcMetadata,
      contents_checked: false,
      proof: 'metadata-only path/status; ADC JSON contents are never read',
    },
    github: {
      path: githubCredentialsPath,
      status: githubCredentialsStatus,
      metadata: githubMetadata,
      contents_checked: false,
      proof: 'metadata-only path/status plus gh auth status; token contents are never read',
    },
    expo: {
      paths: [expoCredentialsPath, easCredentialsPath],
      statuses: {
        expo: expoCredentialsStatus,
        eas: easCredentialsStatus,
      },
      metadata: [expoMetadata, easMetadata],
      contents_checked: false,
      proof: 'metadata-only path/status plus Expo/EAS status; token contents are never read',
    },
  },
  reports: {
    stitch_adc_setup: stitchReportStatus,
    eas_robot_auth_setup: easReportStatus,
  },
  git: {
    identity: gitIdentityStatus,
    github_auth: githubAuthStatus,
  },
  preflight: preflightStatus,
  reporting: 'status only; no credential values, raw auth output, ADC JSON, database URLs, bearer tokens, or private keys',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
NODE

echo "project-bootstrap agent setup complete: report=${REPORT_PATH}"
