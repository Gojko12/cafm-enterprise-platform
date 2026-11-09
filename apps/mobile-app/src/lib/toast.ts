export function notify(message: string) {
  window.dispatchEvent(new CustomEvent<string>("cafm-toast", { detail: message }));
}
