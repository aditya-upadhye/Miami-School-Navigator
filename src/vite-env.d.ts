/// <reference types="vite/client" />

// React 19: Make JSX namespace globally available
// This prevents TS2503 ("Cannot find namespace 'JSX'") when code uses
// JSX.Element, JSX.IntrinsicElements, etc. without an explicit import.
import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
  }
}

