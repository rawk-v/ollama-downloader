declare module '*.svg' {
  const content: string
  export default content
}

declare module 'electron-squirrel-startup' {
  const started: boolean
  export default started
}
