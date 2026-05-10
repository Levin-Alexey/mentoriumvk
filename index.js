export default {
	async fetch(request, env, ctx) {
		return new Response("MentoriumVK Worker is running", {
			headers: { "content-type": "text/plain; charset=UTF-8" },
		});
	},
};
