import type { ErrorCode } from '../../shared/protocol.js';

const TEXTS: Record<ErrorCode, string> = {
  bad_message: 'Mensagem inválida.',
  rate_limited: 'Calma, parceiro! Você está mandando coisa demais.',
  not_in_room: 'Você não está em nenhuma mesa.',
  already_in_room: 'Você já está em uma mesa.',
  room_not_found: 'Mesa não encontrada. Confira o código.',
  room_full: 'A mesa está cheia.',
  room_started: 'O jogo dessa mesa já começou.',
  bad_token: 'Sessão expirada. Entre na mesa de novo.',
  bad_seat: 'Essa cadeira não existe.',
  seat_taken: 'Essa cadeira já está ocupada.',
  need_seat: 'Escolha uma cadeira primeiro.',
  not_in_lobby: 'A mesa não está mais no salão de espera.',
  not_playing: 'O jogo ainda não começou.',
  illegal_intent: 'Jogada não permitida agora.',
  internal: 'Erro interno do servidor. Tente de novo.',
};

/** pt-BR text for a server error code. */
export function errorText(code: ErrorCode): string {
  return TEXTS[code];
}
