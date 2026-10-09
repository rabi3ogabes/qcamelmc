// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { RequireAdmin } from "./RequireAdmin";

afterEach(cleanup);

type Session = { user: { id: string } } | null;

function fakeClient(session: Session, isAdmin: boolean, opts: { rpcFails?: boolean } = {}) {
  const listeners: ((event: string, session: Session) => void)[] = [];
  return {
    client: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: (cb: (event: string, session: Session) => void) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
      },
      rpc: async () => (opts.rpcFails ? { data: null, error: { message: "boom" } } : { data: isAdmin, error: null }),
    } as never,
    emit: (event: string, next: Session) => listeners.forEach((l) => l(event, next)),
  };
}

const mount = (client: never) =>
  render(
    <MemoryRouter initialEntries={["/admin/pos"]}>
      <Routes>
        <Route path="/admin/login" element={<div>login page</div>} />
        <Route
          path="/admin/pos"
          element={
            <RequireAdmin client={client}>
              <div>secret admin content</div>
            </RequireAdmin>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe("RequireAdmin", () => {
  it("shows the protected page to a signed-in administrator", async () => {
    mount(fakeClient({ user: { id: "a1" } }, true).client);
    expect(await screen.findByText("secret admin content")).toBeTruthy();
  });

  it("sends a visitor to the login page and never renders the content", async () => {
    mount(fakeClient(null, false).client);
    expect(await screen.findByText("login page")).toBeTruthy();
    expect(screen.queryByText("secret admin content")).toBeNull();
  });

  it("sends a signed-in non-admin to the login page", async () => {
    mount(fakeClient({ user: { id: "m1" } }, false).client);
    expect(await screen.findByText("login page")).toBeTruthy();
    expect(screen.queryByText("secret admin content")).toBeNull();
  });

  it("fails closed if the admin check itself errors", async () => {
    mount(fakeClient({ user: { id: "a1" } }, true, { rpcFails: true }).client);
    expect(await screen.findByText("login page")).toBeTruthy();
    expect(screen.queryByText("secret admin content")).toBeNull();
  });

  it("never flashes the content while it is still checking", async () => {
    mount(fakeClient({ user: { id: "a1" } }, true).client);
    expect(screen.queryByText("secret admin content")).toBeNull();
    await waitFor(() => expect(screen.getByText("secret admin content")).toBeTruthy());
  });

  it("locks the page again when the user signs out", async () => {
    const { client, emit } = fakeClient({ user: { id: "a1" } }, true);
    mount(client);
    await screen.findByText("secret admin content");
    emit("SIGNED_OUT", null);
    expect(await screen.findByText("login page")).toBeTruthy();
  });
});
