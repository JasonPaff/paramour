import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from "next";
import Link from "next/link";
import { buildPath, href, safeDecodeParams } from "paramour";

import { type GuideTopic, guides, guideTopics } from "../../lib/guides";
import { guideRoute } from "../../lib/routes";

interface GuideProps {
  body: string;
  title: string;
  topic: GuideTopic;
}

// The STRING form of getStaticPaths: `paths` accepts plain path strings, and
// buildPath(route, params) is typed path building — a bad params object fails
// `next build` with a SerializeError, not a request at runtime.
export const getStaticPaths: GetStaticPaths = () => ({
  // "blocking": URLs outside the prebuilt set still reach getStaticProps on
  // first request — which is why the decode below genuinely matters.
  fallback: "blocking",
  paths: guideTopics.map((topic) => buildPath(guideRoute, { topic })),
});

// The pages STATIC surface (PR10): a getStaticProps context carries no query
// string, so parseContext rejects it by design — decode ctx.params directly.
// Node has already percent-decoded the values, hence percentDecode: false.
export const getStaticProps: GetStaticProps<GuideProps> = (ctx) => {
  const result = safeDecodeParams(guideRoute, ctx.params ?? {}, {
    percentDecode: false,
  });
  // Under fallback: "blocking" this arm is REACHABLE: /guides/not-a-topic
  // fails the enum grammar here and becomes a real 404.
  if (result.status === "error") return { notFound: true };
  const { topic } = result.data;
  return { props: { topic, ...guides[topic] } };
};

export default function GuidePage({
  body,
  title,
  topic,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const others = guideTopics.filter((t) => t !== topic);

  return (
    <main>
      <p className="eyebrow">Statically generated at build time</p>
      <h1>{title}</h1>
      <p className="lede">{body}</p>
      <dl className="kv">
        <dt>
          <code>params.topic</code> — <code>p.enum(guideTopics)</code>
        </dt>
        <dd>
          {topic} — one of {guideTopics.join(", ")}
        </dd>
        <dt>How this page was built</dt>
        <dd>
          <code>getStaticPaths</code> returned{" "}
          <code>buildPath(guideRoute, &#123; topic &#125;)</code> for each
          topic; <code>getStaticProps</code> re-decoded <code>ctx.params</code>{" "}
          with <code>safeDecodeParams</code>. Try{" "}
          <code>/guides/not-a-topic</code>: <code>fallback: "blocking"</code>{" "}
          sends it through the same decode, which rejects it to a 404.
        </dd>
      </dl>
      <p className="eyebrow">Other guides</p>
      <ul>
        {others.map((other) => (
          <li key={other}>
            <Link href={href(guideRoute, { params: { topic: other } })}>
              {guides[other].title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
