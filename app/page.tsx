import Link from "next/link";
import { Heading, Panel, Button } from "@/components/ui";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-20">
      <div className="text-center">
        <Heading className="text-5xl">Cricattax</Heading>
        <p className="mt-3 font-body text-silver/70">
          Draft your IPL squad from the mystery box.
        </p>
      </div>

      <Panel className="w-full max-w-sm space-y-4">
        <Link href="/create" className="block">
          <Button className="w-full">Create a game</Button>
        </Link>
        <Link href="/join" className="block">
          <Button variant="secondary" className="w-full">
            Join a game
          </Button>
        </Link>
      </Panel>

      <Link
        href="/status"
        className="font-body text-xs text-silver/40 hover:text-silver/70"
      >
        pipeline status check
      </Link>
    </div>
  );
}

