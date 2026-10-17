import { useReducer } from 'react';

const merge = (state, patch) => ({ ...state, ...(typeof patch === 'function' ? patch(state) : patch) });
const init = (initial) => (typeof initial === 'function' ? initial() : initial);

/**
 * Object state with a class-style merging setter.
 * `setState({ a: 1 })` merges; `setState((s) => ({ a: s.a + 1 }))` reads the latest state.
 * `initial` may be a value or a function that returns one.
 */
export function useSetState(initial) {
  return useReducer(merge, initial, init);
}
