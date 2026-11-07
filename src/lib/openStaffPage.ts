import { buildStaffUrl } from "@/lib/staffHandoff";

/** Reserve a tab during the click, before requesting the one-time token. */
export const openStaffPage = async (to: string): Promise<void> => {
  // noopener/noreferrer features deliberately return null in some browsers.
  // Keep the handle for navigation, but detach the opener immediately instead.
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;

  const url = await buildStaffUrl(to);
  if (tab && !tab.closed) {
    tab.location.replace(url);
  } else {
    // A blocked popup must not trigger another async (blocked) popup attempt.
    window.location.assign(url);
  }
};