import * as fs from 'fs'
import { exec as cbExec } from 'child_process'
import { app as electronApp } from 'electron'
import * as path from 'path'
import { promisify } from 'util'

const exec = promisify(cbExec)
const symlinkPath = '/usr/local/bin/ollama'

function isPackaged() {
  if (process && process.type === 'renderer') {
    return !(process as NodeJS.Process & { defaultApp?: boolean }).defaultApp
  }

  return electronApp.isPackaged
}

function ollamaPath() {
  return isPackaged()
    ? path.join(process.resourcesPath, 'darwin', 'ollama')
    : path.resolve(process.cwd(), '..', 'dist', 'darwin', 'ollama')
}

export function installed() {
  const ollama = ollamaPath()
  return fs.existsSync(symlinkPath) && fs.readlinkSync(symlinkPath) === ollama
}

export async function install() {
  const ollama = ollamaPath()
  const command = `do shell script "mkdir -p ${path.dirname(
    symlinkPath
  )} && ln -F -s \\"${ollama}\\" \\"${symlinkPath}\\"" with administrator privileges`

  await exec(`osascript -e '${command}'`)
}
