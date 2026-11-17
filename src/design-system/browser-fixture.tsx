/** Dev-browser regression fixture. Never imported by the product or production build. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as R from "./react";

export function mountReactFixture() {
  const container = document.createElement("div");
  container.id = "p3-react-fixture";
  document.body.append(container);
  const root = createRoot(container);
  const calls = { close: 0, cancel: 0, selected: 0 };
  const render = (open: boolean) =>
    flushSync(() =>
      root.render(
        <StrictMode>
          <R.Dialog
            open={open}
            title="React lifecycle"
            body="Accessible description"
            id="p3-react-dialog"
            onClose={() => calls.close++}
            onCancel={() => calls.cancel++}
            data-action="react-modal"
          >
            <R.Input aria-label="First" id="p3-react-first" />
            <R.Button id="p3-react-last">Last</R.Button>
          </R.Dialog>
        </StrictMode>,
      ),
    );
  render(true);
  return {
    calls,
    render,
    dispose: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}
export function mountReactMenuFixture() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let selected = 0;
  const render = () =>
    flushSync(() =>
      root.render(
        <R.Menu
          id="p3-react-menu"
          data-action="actions"
          label="Actions"
          trigger="Open React menu"
          placement="end"
          items={[
            { label: "New piece", onSelect: () => selected++ },
            { label: "New ensemble", onSelect: () => selected++ },
            { label: "Busy", busy: true, onSelect: () => selected++ },
          ]}
        />,
      ),
    );
  render();
  return {
    container,
    render,
    get selected() {
      return selected;
    },
    dispose: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}
