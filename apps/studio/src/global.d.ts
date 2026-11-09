import type { JSX as ReactJSX } from 'react';

declare global {
  // React 19 no longer provides a global JSX namespace; components here return JSX.Element.
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}
