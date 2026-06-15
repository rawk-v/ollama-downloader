import * as fs from 'fs'
import { exec as cbExec } from 'child_process'
import { app as electronApp } from 'electron'
import { app as remoteApp } from '@electron/remote'
import * as path from 'path'
import { promisify } from 'util'

const app = process && process.type === 'renderer' ? remoteApp : electronApp
const ollama = app.isPackaged
  ? path.join(process.resourcesPath, 'darwin', 'ollama')
  : path.resolve(process.cwd(), '..', 'dist', 'darwin', 'ollama')
const exec = promisify(cbExec)
const symlinkPath = '/usr/local/bin/ollama'

export function installed() {
  return fs.existsSync(symlinkPath) && fs.readlinkSync(symlinkPath) === ollama
}

export async function install() {
  const command = `do shell script "mkdir -p ${path.dirname(
    symlinkPath
  )} && ln -F -s \\"${ollama}\\" \\"${symlinkPath}\\"" with administrator privileges`

  await exec(`osascript -e '${command}'`)
}
