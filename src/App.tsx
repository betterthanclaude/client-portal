import { useState } from "react";
import { HomePage } from "./components/HomePage";
import { SignInPage } from "./components/SignInPage";

export default function App() {
  const [signedIn, setSignedIn] = useState(() => sessionStorage.getItem('kanook-preview-session') === 'active');

  function enterWorkspace() {
    sessionStorage.setItem('kanook-preview-session', 'active');
    setSignedIn(true);
  }

  if (signedIn) return <HomePage />;

  return (
    <SignInPage
      onSignIn={(event) => {
        event.preventDefault();
        enterWorkspace();
      }}
      onGoogleSignIn={() => {
        enterWorkspace();
      }}
      onResetPassword={() => {
        console.log("Reset password");
      }}
      onCreateAccount={() => {
        console.log("Create account");
      }}
    />
  );
}
