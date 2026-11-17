import { useState, type FormEvent, type ReactNode } from "react";
import Dither from "./ui/Dither";

interface SignInPageProps {
  title?: ReactNode;
  description?: ReactNode;
  onSignIn?: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
}

type Mode = "login" | "signup";

type Notice = {
  tone: "error" | "ok";
  text: string;
};

function KanookMark() {
  return (
    <>
      <span className="sr">Kanook</span>
      <span aria-hidden="true">
        Ka<span className="italic">n</span>ook
      </span>
    </>
  );
}

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="google-icon" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"
    />
  </svg>
);

function EyeIcon({ off }: { off: boolean }) {
  if (off) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
        <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
        <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
        <path d="m2 2 20 20" />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function GlassInputWrapper({ children }: { children: ReactNode }) {
  return <div className="glass">{children}</div>;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function SignInPage({
  title = <KanookMark />,
  description = "Access your account and continue your journey with us",
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateAccount,
}: SignInPageProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  function switchMode() {
    const next = mode === "login" ? "signup" : "login";
    setMode(next);
    setNotice(null);
    if (next === "signup") onCreateAccount?.();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    if (!email || !password) {
      setNotice({ tone: "error", text: "Enter your email and password." });
      return;
    }

    if (!isEmail(email)) {
      setNotice({ tone: "error", text: "Enter a valid email." });
      return;
    }

    if (mode === "signup" && password.length < 8) {
      setNotice({ tone: "error", text: "Use at least 8 characters." });
      return;
    }

    onSignIn?.(event);
    setNotice({
      tone: "ok",
      text: mode === "login" ? "Signed in." : "Account created.",
    });
  }

  function handleReset() {
    const email = (document.getElementById("email") as HTMLInputElement | null)?.value.trim() ?? "";
    if (!email || !isEmail(email)) {
      setNotice({ tone: "error", text: "Enter your email to reset." });
      return;
    }
    onResetPassword?.();
    setNotice({ tone: "ok", text: "Reset link sent." });
  }

  function handleGoogle() {
    onGoogleSignIn?.();
    setNotice({ tone: "ok", text: "Continue with Google." });
  }

  const emailInvalid = notice?.tone === "error" && /email/i.test(notice.text);
  const passwordInvalid = notice?.tone === "error" && /password|character/i.test(notice.text);

  return (
    <div className="signin">
      <section className="signin-form">
        <div className="signin-form-inner">
          <h1 className="wordmark animate-element delay-100">{title}</h1>
          <p className="lede animate-element delay-200">{description}</p>

          <form className="form" onSubmit={handleSubmit} noValidate onInput={() => notice && setNotice(null)}>
            <div className="animate-element delay-300">
              <label className="field-label" htmlFor="email">
                Email Address
              </label>
              <GlassInputWrapper>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Enter your email address"
                  aria-invalid={emailInvalid || undefined}
                />
              </GlassInputWrapper>
            </div>

            <div className="animate-element delay-400">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <GlassInputWrapper>
                <div className="password-row">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="Enter your password"
                    aria-invalid={passwordInvalid || undefined}
                  />
                  <button
                    type="button"
                    className="eye"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
              </GlassInputWrapper>
            </div>

            <div className="meta animate-element delay-500">
              <label className="remember">
                <input className="custom-checkbox" type="checkbox" name="rememberMe" />
                <span>Keep me signed in</span>
              </label>
              <button type="button" className="link" onClick={handleReset}>
                Reset password
              </button>
            </div>

            {notice && (
              <p className="notice" data-tone={notice.tone} role="status">
                {notice.text}
              </p>
            )}

            <button type="submit" className="submit animate-element delay-600">
              {mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="divider animate-element delay-700">
            <span>Or continue with</span>
          </div>

          <button type="button" className="google animate-element delay-800" onClick={handleGoogle}>
            <GoogleIcon />
            Continue with Google
          </button>

          <p className="switch-copy animate-element delay-900">
            {mode === "login" ? "New to our platform? " : "Already have an account? "}
            <button type="button" className="link" onClick={switchMode}>
              {mode === "login" ? "Create Account" : "Sign In"}
            </button>
          </p>

        </div>
      </section>

      <section className="hero">
        <Dither
          className="hero-glass"
          palette={["#0c0a08", "#161310", "#2a221c", "#3f342b"]}
          brightness={-0.22}
          ditherMode="bayer"
          pixelSize={2}
          waveSpeed={0.05}
          waveFrequency={3}
          waveAmplitude={0.3}
          mouseEffect="erase"
          mouseRadius={0.3}
        />
        <p className="hero-mark">
          <span className="sr">Oru’el</span>
          <span aria-hidden="true">
            Or<span className="italic">u</span>’el
          </span>
        </p>
      </section>
    </div>
  );
}
