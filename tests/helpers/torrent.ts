const enc = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));

export const validSingle = () =>
  enc(`d4:infod6:lengthi10e4:name8:game.nsp12:piece lengthi16384e6:pieces20:${"x".repeat(20)}ee`);
