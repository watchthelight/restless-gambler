declare module 'canvas' {
  export function createCanvas(width: number, height: number): any;
  export function loadImage(data: Buffer | string): Promise<any>;
}

