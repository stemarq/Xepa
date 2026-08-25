/** Open Finance (SD25–SD27). Mora sob /grana: é automação financeira. */

import type {
  ConexaoOpenFinance,
  InstituicaoOpenFinance,
  RespostaNovoConsentimento,
  ResumoDaSincronizacao,
} from '@/types/api';
import { requisitar } from './cliente';

/**
 * `simulado` diz se o backend está falando com um agregador de verdade ou com
 * o provedor de demonstração. Quem decide é variável de ambiente no servidor,
 * então o app precisa perguntar — e precisa saber para não anunciar na tela
 * uma conexão que não é o que parece.
 */
export function listarInstituicoes() {
  return requisitar<{
    instituicoes: InstituicaoOpenFinance[];
    simulado: boolean;
    /** Vem vazia de propósito: quem lista os bancos é o widget do agregador. */
    escolhaNoWidget: boolean;
    sandbox: boolean;
  }>('/grana/open-finance/instituicoes');
}

export function listarConexoes() {
  return requisitar<{ conexoes: ConexaoOpenFinance[] }>('/grana/open-finance/conexoes');
}

/** RF034 — abre o consentimento e devolve para onde mandar o usuário. */
/** `instituicaoId` só existe quando a escolha é da nossa lista, não do widget. */
export function criarConsentimento(instituicaoId?: string) {
  return requisitar<RespostaNovoConsentimento>('/grana/open-finance/consentimentos', {
    metodo: 'POST',
    corpo: instituicaoId ? { instituicaoId } : {},
  });
}

/**
 * Faz o papel da tela do banco, onde o usuário digitaria a senha — fora do Xepa
 * (RNF18). Só existe enquanto o provedor for o simulado; com um agregador real
 * o app abriria a `urlDeAutorizacao` no navegador e isto sairia.
 */
export function simularAutorizacao(consentimentoId: number) {
  return requisitar<void>(
    `/grana/open-finance/consentimentos/${consentimentoId}/simular-autorizacao`,
    { metodo: 'POST' },
  );
}

/**
 * Confirma a autorização e traz as contas destravadas.
 *
 * `idExterno` é o vínculo criado pelo widget do agregador — com ele o backend
 * troca o id provisório pelo definitivo. Com o provedor simulado não existe, e
 * o backend ignora.
 */
export function autorizarConsentimento(
  consentimentoId: number,
  idExterno?: string,
  instituicao?: string,
) {
  return requisitar<{ contas: unknown[] }>(
    `/grana/open-finance/consentimentos/${consentimentoId}/autorizar`,
    {
      metodo: 'POST',
      corpo: {
        ...(idExterno ? { idExterno } : {}),
        ...(instituicao ? { instituicao } : {}),
      },
    },
  );
}

/** RF035 — importa o extrato (RN19, RN20). */
export function sincronizar(consentimentoId: number) {
  return requisitar<{ resumo: ResumoDaSincronizacao }>(
    `/grana/open-finance/consentimentos/${consentimentoId}/sincronizar`,
    { metodo: 'POST' },
  );
}

/** RF036 — revoga. O histórico importado permanece (RN21). */
export function revogarConsentimento(consentimentoId: number) {
  return requisitar<void>(`/grana/open-finance/consentimentos/${consentimentoId}`, {
    metodo: 'DELETE',
  });
}
