interface Env {
  GITHUB_OAUTH_CLIENT_ID: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const redirect = url.searchParams.get("redirect") || "/";
  const redirectUri = `${url.origin}/auth/github/callback`;
  const githubUrl =
    `https://github.com/login/oauth/authorize?` +
    `client_id=${encodeURIComponent(context.env.GITHUB_OAUTH_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("read:user user:email")}` +
    `&state=${encodeURIComponent(redirect)}`;

  return new Response(JSON.stringify({ url: githubUrl }), {
    headers: { "Content-Type": "application/json" },
  });
};
