declare module 'citeproc' {
  export function parseParticles(name: { family: string; given: string; [key: string]: string }): void;
}
