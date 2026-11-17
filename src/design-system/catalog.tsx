/** Development-only examples exercise real adapters, never alternate component markup. */
import type { ReactNode } from "react";
import * as r from "./recipes";
import * as R from "./react";
import * as D from "./dom";
export interface Specimen {
  name: string;
  react: ReactNode;
  dom: () => HTMLElement;
}
export function specimens(): Specimen[] {
  const rows: Specimen[] = [];
  for(const part of r.workspaceParts) rows.push({name:`workspace/${part}`,react:<R.Workspace as={part==='wordmark'?'a':'div'} href={part==='wordmark'?'/app':undefined} part={part}>Workspace</R.Workspace>,dom:()=>D.createWorkspace({as:part==='wordmark'?'a':'div',attrs:part==='wordmark'?{href:'/app'}:undefined,part,text:'Workspace'})});
  rows.push({name:'navigation/admin',react:<R.NavigationTabs label="Pages" items={[{value:'users',label:'Users',href:'/admin/users'}]} value="users"/>,dom:()=>D.createNavigationTabs({label:'Pages',items:[{value:'users',label:'Users',href:'/admin/users'}],value:'users'})});
  rows.push({name:'status/admin',react:<R.Status variant="admin">Saved</R.Status>,dom:()=>D.createStatus({variant:'admin',text:'Saved'})});
  rows.push({name:'badge/admin',react:<R.Badge variant="admin" intent="accent">Lead</R.Badge>,dom:()=>D.createBadge({variant:'admin',intent:'accent',text:'Lead'})});
  for (const variant of r.buttonVariants)
    for (const intent of ["secondary", "primary", "danger", "quiet"] as const)
      for (const state of ["default", "disabled", "busy", "pressed"] as const) {
        const props = {
          variant,
          intent,
          disabled: state === "disabled",
          busy: state === "busy",
          pressed: state === "pressed",
        };
        rows.push({
          name: `button/${variant}/${intent}/${state}`,
          react: <R.Button {...props}>Continue</R.Button>,
          dom: () => D.createButton({ ...props, text: "Continue" }),
        });
      }
  for (const variant of r.iconButtonVariants)
    rows.push({
      name: `icon-button/${variant}`,
      react: (
        <R.IconButton variant={variant} label="Close">
          ×
        </R.IconButton>
      ),
      dom: () =>
        D.createIconButton({
          variant,
          label: "Close",
          icon: document.createTextNode("×"),
        }),
    });
  rows.push({
    name: "field-group/transcription",
    react: <R.FieldGroup variant="transcription" label="Language"><R.Button variant="transcription-language">EN</R.Button></R.FieldGroup>,
    dom: () => { const content = document.createElement("div"); content.append(D.createButton({variant:"transcription-language",text:"EN"})); return D.createFieldGroup({variant:"transcription",label:"Language",content}); },
  });
  for (const variant of r.fieldVariants)
    for (const invalid of [false, true])
      for (const control of ["input", "select", "textarea"] as const) {
        const props = { variant, invalid };
        rows.push({
          name: `field/${variant}/${control}/${invalid ? "invalid" : "normal"}`,
          react: (
            <R.Field
              {...props}
              label="Name"
              hint="A hint"
              error={invalid ? "A validation error" : undefined}
            >
              {(a) =>
                control === "input" ? (
                  <R.Input {...a} defaultValue="LightScore" />
                ) : control === "textarea" ? (
                  <R.Textarea {...a} defaultValue="LightScore" />
                ) : (
                  <R.Select {...a} defaultValue="one">
                    <option value="one">LightScore</option>
                  </R.Select>
                )
              }
            </R.Field>
          ),
          dom: () =>
            D.createField({
              ...props,
              label: "Name",
              hint: "A hint",
              error: invalid ? "A validation error" : undefined,
              control:
                control === "input"
                  ? D.createInput({ ...props, value: "LightScore" })
                  : control === "textarea"
                    ? D.createTextarea({ ...props, value: "LightScore" })
                    : D.createSelect({
                        ...props,
                        value: "one",
                        options: [{ value: "one", label: "LightScore" }],
                      }),
            }),
        });
      }
  for (const variant of r.checkboxVariants)
    for (const checked of [false, true])
      rows.push({
        name: `checkbox/${variant}/${checked}`,
        react: (
          <R.Checkbox
            variant={variant}
            label="Permission"
            checked={checked}
            readOnly
          />
        ),
        dom: () =>
          D.createCheckbox({
            variant,
            label: "Permission",
            checked,
            readOnly: true,
          }),
      });
  for (const variant of r.switchVariants)
    for (const checked of [false, true])
      rows.push({
        name: `switch/${variant}/${checked}`,
        react: <R.Switch variant={variant} checked={checked} label="Enabled" />,
        dom: () => D.createSwitch({ variant, checked, label: "Enabled" }),
      });
  for (const variant of r.switchVariants)
    for (const checked of [false, true])
      rows.push({
        name: `switch-native/${variant}/${checked}`,
        react: (
          <R.Switch
            mode="checkbox"
            variant={variant}
            checked={checked}
            label="Enabled"
          />
        ),
        dom: () =>
          D.createSwitch({
            mode: "checkbox",
            variant,
            checked,
            label: "Enabled",
          }),
      });
  for (const variant of r.cardVariants)
    rows.push({
      name: `card/${variant}`,
      react: <R.Card variant={variant}>A surface</R.Card>,
      dom: () => D.createCard({ variant, text: "A surface" }),
    });
  rows.push({
    name: "control-group/trailing-action",
    react: <R.ControlGroup><R.Input variant="ruled-account" layout="tw:pr-action-reserve" aria-label="Password" type="password" /><R.Button variant="password-toggle">show</R.Button></R.ControlGroup>,
    dom: () => D.createControlGroup({content: [D.createInput({variant: "ruled-account", layout: "tw:pr-action-reserve", type: "password", attrs: {"aria-label": "Password"}}), D.createButton({variant: "password-toggle", text: "show"})]}),
  });
  rows.push({
    name: "toggle-group/language-separated",
    react: <R.ToggleGroup variant="language" separator=" · " label="Language / Sprache" value="en" items={[{value: "de",label: "DE"},{value: "en",label: "EN"}]} />,
    dom: () => D.createToggleGroup({variant: "language", separator: " · ", label: "Language / Sprache", value: "en", items: [{value: "de",label: "DE"},{value: "en",label: "EN"}]}),
  });
  for (const intent of r.feedbackIntents) {
    rows.push({name: `status/account/${intent}`, react: <R.Status variant="account" intent={intent}>Status</R.Status>, dom: () => D.createStatus({variant:"account", intent, text:"Status"})});
    rows.push({
      name: `badge/${intent}`,
      react: <R.Badge intent={intent}>Status</R.Badge>,
      dom: () => D.createBadge({ intent, text: "Status" }),
    });
    rows.push({
      name: `status/${intent}`,
      react: <R.Status intent={intent}>Status</R.Status>,
      dom: () => D.createStatus({ intent, text: "Status" }),
    });
  }
  for (const variant of r.toggleGroupVariants) {
    const items = [
      { value: "de", label: "DE" },
      { value: "en", label: "EN" },
      { value: "fr", label: "FR", disabled: true },
    ];
    rows.push({
      name: `toggle-group/${variant}`,
      react: (
        <R.ToggleGroup
          variant={variant}
          label="Language"
          value="en"
          items={items}
        />
      ),
      dom: () =>
        D.createToggleGroup({ variant, label: "Language", value: "en", items }),
    });
  }
  rows.push({
    name: "toolbar",
    react: (
      <R.Toolbar label="Actions">
        <R.Button>Continue</R.Button>
      </R.Toolbar>
    ),
    dom: () => {
      const el = D.createToolbar({ label: "Actions" });
      el.append(D.createButton({ text: "Continue" }));
      return el;
    },
  });
  rows.push({
    name: "loading",
    react: <R.Loading>Loading</R.Loading>,
    dom: () => D.createLoading({ text: "Loading" }),
  });
  for (const variant of r.emptyStateVariants)
    rows.push({
      name: `empty/${variant}`,
      react: (
        <R.EmptyState
          variant={variant}
          title="No pieces"
          body="Add a piece to begin"
          action={<R.Button>Add</R.Button>}
        />
      ),
      dom: () =>
        D.createEmptyState({
          variant,
          title: "No pieces",
          body: "Add a piece to begin",
          action: D.createButton({ text: "Add" }),
        }),
    });
  for (const variant of r.dialogVariants)
    rows.push({
      name: `dialog/${variant}`,
      react: (
        <R.Dialog
          variant={variant}
          open
          specimen
          title="A dialog"
          body="A shared panel"
          actions={<R.Button>Continue</R.Button>}
        />
      ),
      dom: () => {
        const { element } = D.createDialog({
          variant,
          title: "A dialog",
          body: "A shared panel",
          actions: D.createButton({ text: "Continue" }),
        });
        element.open = true;
        return element;
      },
    });
  for (const variant of r.menuVariants) {
    const items = [
      { label: "First", onSelect: () => {} },
      { label: "Selected", checked: true, onSelect: () => {} },
      { label: "Unavailable", disabled: true, onSelect: () => {} },
      { label: "Remove", danger: true, onSelect: () => {} },
    ];
    rows.push({
      name: `menu/${variant}`,
      react: <R.Menu variant={variant} label="Actions" items={items} />,
      dom: () => D.createMenu({ variant, label: "Actions", items }).element,
    });
  }
  for (const kind of r.toastVariants)
    rows.push({
      name: `toast/${kind}`,
      react: <R.Toast kind={kind}>A notification</R.Toast>,
      dom: () => D.createToast({ kind, text: "A notification" }),
    });
  for (const variant of r.tableVariants)
    rows.push({
      name: `table/${variant}`,
      react: (
        <R.Table variant={variant}>
          <thead>
            <R.TableRow>
              <R.TableHeader>Name</R.TableHeader>
            </R.TableRow>
          </thead>
          <tbody>
            <R.TableRow>
              <R.TableCell>LightScore</R.TableCell>
            </R.TableRow>
            <R.TableRow>
              <R.TableEmpty>No more results</R.TableEmpty>
            </R.TableRow>
          </tbody>
        </R.Table>
      ),
      dom: () => {
        const table = D.createTable({ variant });
        const head = document.createElement("thead"),
          body = document.createElement("tbody");
        const h = D.createTableRow({ variant }),
          row = D.createTableRow({ variant }),
          empty = D.createTableRow({ variant });
        h.append(D.createTableHeader("Name", { variant }));
        head.append(h);
        row.append(D.createTableCell("LightScore", { variant }));
        empty.append(D.createTableEmpty("No more results", { variant }));
        body.append(row, empty);
        table.append(head, body);
        return table;
      },
    });
  rows.push({
    name: "table/pagination",
    react: <R.TablePagination>Page 1</R.TablePagination>,
    dom: () => {
      const el = D.createTablePagination();
      el.textContent = "Page 1";
      return el;
    },
  });
  return rows;
}
