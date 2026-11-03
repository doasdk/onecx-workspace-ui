import { resolve } from 'node:path'
import { isRecord, readRuntimeJson } from './runtimeConfig'

const data = readRuntimeJson('TEST_DATA_JSON_FILE', 'TEST_DATA_JSON', resolve(__dirname, '../config/data.json'))
if (
  !isRecord(data) ||
  !isRecord(data.users) ||
  !isRecord(data.users.onecxUser) ||
  typeof data.users.onecxUser.username !== 'string' ||
  !data.users.onecxUser.username ||
  typeof data.users.onecxUser.password !== 'string' ||
  !data.users.onecxUser.password
) {
  throw new Error('Test data requires users.onecxUser with non-empty username and password.')
}

export const users = {
  onecxUser: {
    username: data.users.onecxUser.username,
    password: data.users.onecxUser.password
  }
}
