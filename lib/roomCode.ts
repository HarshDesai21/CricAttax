import { randomInt } from "crypto";

// Excludes visually ambiguous characters (0/O, 1/I/L) so a room code is easy
// to read aloud or type from memory.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
