import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token opaco de 256 bits. Vale tanto para a sessão (SD02) quanto para o link
 * de redefinição de senha (SD04).
 */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * O banco guarda só o SHA-256 do token. Como o token já é aleatório e longo,
 * um hash rápido basta — não há espaço de busca para força bruta, e um
 * vazamento do banco não entrega sessões utilizáveis (RNF07).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparação em tempo constante entre dois hashes hexadecimais. */
export function hashesIguais(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function expiraEm(minutos: number): Date {
  return new Date(Date.now() + minutos * 60_000);
}

/** RF039 — o token de renovação vive em dias, não em minutos. */
export function expiraEmDias(dias: number): Date {
  return expiraEm(dias * 24 * 60);
}
