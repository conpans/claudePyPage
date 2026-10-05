/// <reference types="vite/client" />

declare module 'virtual:stepwise-content' {
  const content: import('./content/schema.ts').ContentData
  export default content
}
