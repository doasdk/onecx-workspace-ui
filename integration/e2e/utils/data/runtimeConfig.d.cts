export type ShellEnvironment = {
  baseUrl: string
  loginUrl: string
  workspaceManagementUrl: string
}

export function isRecord(value: unknown): value is Record<string, unknown>
export function readRuntimeJson(
  fileVariable: string,
  jsonVariable: string,
  fallbackPath?: string,
  env?: NodeJS.ProcessEnv
): unknown
export function loadEnvironment(env?: NodeJS.ProcessEnv): { adminShell: ShellEnvironment }
export function loadUsers(env?: NodeJS.ProcessEnv): { onecxUser: { username: string; password: string } }
