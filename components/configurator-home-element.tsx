'use client';

import { createRoot, Root } from "react-dom/client";
import Home, { Config, HomeClassNames, defaultConfig } from "@/components/Home";

type PartialHomeProps = {
  config?: Config;
  classNames?: Partial<HomeClassNames>;
};

export class ConfiguratorHomeElement extends HTMLElement {
  static get observedAttributes() {
    return ["config", "classnames"];
  }

  #root: Root | null = null;
  #mount: HTMLDivElement | null = null;
  #currentProps: PartialHomeProps = {};

  get config(): Config | undefined {
    return this.#currentProps.config;
  }

  set config(value: Config | undefined) {
    this.#currentProps.config = value;
    this.#render();
  }

  get classNames(): Partial<HomeClassNames> | undefined {
    return this.#currentProps.classNames;
  }

  set classNames(value: Partial<HomeClassNames> | undefined) {
    this.#currentProps.classNames = value;
    this.#render();
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    if (!this.#mount) {
      this.#mount = document.createElement("div");
      this.shadowRoot!.appendChild(this.#mount);
    }

    this.#currentProps = {
      config: this.#parseJsonAttribute("config") ?? defaultConfig,
      classNames: this.#parseJsonAttribute("classnames") ?? undefined,
    };

    this.#render();
  }

  disconnectedCallback() {
    if (this.#root) {
      this.#root.unmount();
      this.#root = null;
    }
  }

  attributeChangedCallback() {
    this.#currentProps = {
      ...this.#currentProps,
      config: this.#parseJsonAttribute("config") ?? this.#currentProps.config,
      classNames: this.#parseJsonAttribute("classnames") ?? this.#currentProps.classNames,
    };
    this.#render();
  }

  #parseJsonAttribute<T extends object>(attr: string): T | undefined {
    const value = this.getAttribute(attr);
    if (!value) return undefined;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      // Leave a breadcrumb for developers embedding the element.
      console.warn(`[configurator-home] Failed to parse ${attr} attribute as JSON`, error);
      return undefined;
    }
  }

  #render() {
    if (!this.#mount) return;

    if (!this.#root) {
      this.#root = createRoot(this.#mount);
    }

    const props: PartialHomeProps = {
      config: this.#currentProps.config ?? defaultConfig,
      classNames: this.#currentProps.classNames,
    };

    this.#root.render(<Home {...props} />);
  }
}

export function defineConfiguratorHomeElement(tagName = "configurator-home") {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ConfiguratorHomeElement);
  }
  return tagName;
}

export { ConfiguratorHomeElement };
