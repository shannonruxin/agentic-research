import { SignIn } from "@clerk/nextjs";

export default function SignInCatchAllPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4">
      <SignIn
        appearance={{
          elements: { rootBox: "mx-auto", card: "shadow-lg" },
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
      />
    </div>
  );
}
