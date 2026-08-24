/**
 * Desbloqueio biométrico (RNF19).
 *
 * O "continuar conectado" (RF039) guarda no aparelho um segredo que abre uma
 * sessão nova sem senha. Isso muda o modelo de ameaça: quem pega o celular
 * destravado entraria direto no financeiro do dono. A biometria é o que
 * devolve a prova de que é a mesma pessoa — sem trazer de volta o teclado.
 *
 * `disableDeviceFallback` fica **falso** de propósito: dedo molhado, máscara,
 * sensor sujo acontecem, e nesses casos o código do aparelho é uma garantia
 * equivalente. Desligar o atalho transformaria uma falha de leitura em "digite
 * a senha de novo", que é exatamente o que a RF039 existe para evitar.
 */

import * as LocalAuthentication from 'expo-local-authentication';

/**
 * O aparelho consegue provar quem está segurando ele?
 *
 * Vale biometria cadastrada **ou** código de aparelho: os dois protegem o
 * segredo guardado. Sem nenhum dos dois não há o que verificar, e aí o
 * "continuar conectado" não é oferecido — guardar um segredo de 30 dias num
 * aparelho que qualquer um destrava seria pior que pedir a senha.
 */
export async function desbloqueioDisponivel(): Promise<boolean> {
  const nivel = await LocalAuthentication.getEnrolledLevelAsync();
  return nivel !== LocalAuthentication.SecurityLevel.NONE;
}

export type ResultadoDesbloqueio = 'ok' | 'recusado' | 'indisponivel';

/**
 * Pede o desbloqueio.
 *
 * `recusado` cobre cancelamento e falha de leitura — os dois deixam o app
 * bloqueado, mas com botão para tentar de novo; não derrubam o segredo. Só
 * `indisponivel` (biometria removida do aparelho depois do login) obriga a
 * voltar ao login.
 */
export async function pedirDesbloqueio(): Promise<ResultadoDesbloqueio> {
  if (!(await desbloqueioDisponivel())) return 'indisponivel';

  const resultado = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Desbloqueie para voltar à sua banca',
    cancelLabel: 'Entrar com senha',
    disableDeviceFallback: false,
  });

  return resultado.success ? 'ok' : 'recusado';
}
