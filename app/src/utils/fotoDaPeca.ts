/**
 * Escolher e preparar a foto de uma peça de roupa (RF038).
 *
 * A foto mora no Postgres, como miniatura — o que só é razoável porque a
 * imagem é reduzida **aqui**, antes de subir. Uma foto de câmera de iPhone tem
 * 3 a 5 MB; a mesma imagem em 400px de largura e JPEG a 70% fica em torno de
 * 40 KB, e um guarda-roupa de trinta peças cabe em pouco mais de um megabyte
 * de banco.
 *
 * O redimensionamento é do aparelho e não do servidor de propósito: o celular
 * tem a imagem original em mãos e uma pipeline nativa para isso, enquanto no
 * servidor custaria dependência nativa e o tempo de subir megabytes que seriam
 * jogados fora na chegada.
 *
 * 400px é a medida do maior lugar onde a foto aparece (o medalhão do cartão,
 * com folga para telas de 3x). Guardar mais resolução seria guardar detalhe
 * que nenhuma tela mostra.
 */

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Largura máxima da miniatura guardada. */
const LARGURA = 400;

/** JPEG a 70%: sem artefato visível neste tamanho, e um terço do peso de 100%. */
const QUALIDADE = 0.7;

export interface FotoPronta {
  base64: string;
  tipo: string;
}

/**
 * Reduz a imagem escolhida e devolve o que a API espera.
 *
 * Sempre JPEG, mesmo que a origem seja PNG ou HEIC: foto de roupa é imagem
 * contínua, onde o JPEG ganha muito de PNG, e o HEIC do iPhone nem sequer é
 * decodificável em todo lugar que possa vir a ler esses bytes.
 */
async function prepararParaEnvio(uri: string): Promise<FotoPronta> {
  const contexto = ImageManipulator.manipulate(uri);
  contexto.resize({ width: LARGURA });

  const imagem = await contexto.renderAsync();
  const salva = await imagem.saveAsync({
    format: SaveFormat.JPEG,
    compress: QUALIDADE,
    base64: true,
  });

  if (!salva.base64) {
    throw new Error('Não foi possível preparar a imagem.');
  }
  return { base64: salva.base64, tipo: 'image/jpeg' };
}

/**
 * Abre a câmera. `null` quando a pessoa desistiu ou negou a permissão — nos
 * dois casos não há nada a fazer além de voltar para a tela como estava.
 */
export async function tirarFoto(): Promise<FotoPronta | null> {
  const permissao = await ImagePicker.requestCameraPermissionsAsync();
  if (!permissao.granted) return null;

  const resultado = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    // Quadrado, que é o formato do medalhão: cortar aqui evita a peça aparecer
    // deformada ou com metade fora do enquadramento depois.
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (resultado.canceled || !resultado.assets[0]) return null;

  return prepararParaEnvio(resultado.assets[0].uri);
}

/** Escolhe da galeria — para a peça que já foi fotografada antes. */
export async function escolherDaGaleria(): Promise<FotoPronta | null> {
  const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) return null;

  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (resultado.canceled || !resultado.assets[0]) return null;

  return prepararParaEnvio(resultado.assets[0].uri);
}
