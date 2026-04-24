import { SignUp } from "@clerk/nextjs";

export default function SignUpCatchAllPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4">
      <SignUp
        appearance={{
          elements: { rootBox: "mx-auto", card: "shadow-lg" },
        }}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
      />
    </div>
  );
}
