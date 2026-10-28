/** Kleiner DOM-Helfer: Elemente deklarativ bauen, Texte immer über textContent (XSS-sicher). */
export interface ElementProps {
  className?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string>;
  onClick?: (event: MouseEvent) => void;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: (Node | string | null | undefined | false)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) node.title = props.title;
  if (props.attrs)
    for (const [key, value] of Object.entries(props.attrs)) node.setAttribute(key, value);
  const onClick = props.onClick;
  if (onClick) node.addEventListener('click', (event) => onClick(event as MouseEvent));
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Button mit optionalem Tastenkürzel-Hinweis. */
export function button(
  label: string,
  onClick: () => void,
  options: { primary?: boolean; hint?: string; disabled?: boolean } = {},
): HTMLButtonElement {
  const node = el('button', {
    className: `btn${options.primary ? ' btn--primary' : ''}`,
    attrs: { type: 'button' },
    onClick: () => {
      if (!node.disabled) onClick();
    },
  });
  node.append(el('span', { text: label }));
  if (options.hint) node.append(el('kbd', { text: options.hint }));
  node.disabled = options.disabled ?? false;
  return node;
}
