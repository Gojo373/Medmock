import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

beforeEach(() => {
  window.localStorage.removeItem("medmock-locale");
  window.localStorage.removeItem("medmock-theme");
  document.documentElement.lang = "en";
  document.documentElement.classList.remove("dark");
});
