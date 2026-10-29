// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EmojiPicker } from "../src/EmojiPicker";
import { InterfaceLanguageProvider } from "../src/i18n";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("does no emoji label work while the picker is closed, including parent updates", () => {
  const labels = vi.spyOn(String.prototype, "toLocaleUpperCase");
  const value = { emoji: "📁", color: "default" } as const;
  const onChange = vi.fn(async () => {});
  const view = render(<InterfaceLanguageProvider><EmojiPicker name="Project" value={value} theme="light" onChange={onChange}/></InterfaceLanguageProvider>);
  view.rerender(<InterfaceLanguageProvider><EmojiPicker name="Project" value={value} theme="dark" onChange={onChange}/></InterfaceLanguageProvider>);
  expect(labels).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Icon, colour and actions for Project" }));
  expect(screen.getByRole("textbox", { name: "Find emoji" })).toBeTruthy();
  expect(labels).toHaveBeenCalled();
});
