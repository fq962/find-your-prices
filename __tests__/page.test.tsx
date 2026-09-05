import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import Page from "@/app/page";

test("Home page renders without crashing", () => {
  const { container } = render(<Page />);
  expect(container.firstChild).not.toBeNull();
});
