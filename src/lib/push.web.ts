// Web: no push notifications (the app store build has them). Same export as push.ts.
export function usePushNotifications() {
  return { askNow: false, isOwner: false, accept: async () => {}, later: () => {} };
}
