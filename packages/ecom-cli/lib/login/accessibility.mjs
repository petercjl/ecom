import {fail} from '../common.mjs';

export const loginLabels = ['登录', 'Login', 'Log in', 'Sign in'];
export const secureField = node => node.states?.some(state => ['password', 'protected', 'secure'].includes(state));
export const isDocument = node => ['webarea', 'document'].includes(node.role);
export const isVisible = node => !node.states?.some(state => ['offscreen', 'hidden', 'invisible'].includes(state));
export const usableButton = node => node.role === 'button' && isVisible(node) && !node.states?.includes('disabled');
export const canClick = node => node.ref_id && usableButton(node);
export const named = (node, labels) => [node.name, node.value].some(value => typeof value === 'string' && labels.includes(value));
export function* descend(node, stop = () => false) {
  yield node;
  if (!stop(node)) for (const child of node.children ?? []) yield* descend(child, stop);
}

export function uniqueButton(buttons, code, message) {
  const refs = new Map(buttons.filter(button => button.ref_id).map(button => [button.ref_id, button]));
  if (refs.size > 1) throw fail(code, message);
  return refs.values().next().value;
}

export function containedPoint(element, window) {
  const box = element.bounds;
  const frame = window.bounds;
  if (!box || !frame || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key]) && Number.isFinite(frame[key])) ||
      box.width < 2 || box.height < 2 || box.x < frame.x || box.y < frame.y ||
      box.x + box.width > frame.x + frame.width || box.y + box.height > frame.y + frame.height) return null;
  return [Math.floor(box.x + box.width / 2), Math.floor(box.y + box.height / 2)];
}
