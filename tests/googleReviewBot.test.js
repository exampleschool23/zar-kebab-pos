import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getGoogleAccessToken,
  listUnansweredReviews,
  publishReviewReply,
} from '../api/google-reviews/_lib/googleBusiness.js'
import {
  buildFallbackReply,
  generateReviewReply,
  sanitizeReply,
} from '../api/google-reviews/_lib/replyGenerator.js'
import { runGoogleReviewBot } from '../api/google-reviews/_lib/runReviewBot.js'

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const config = {
  clientId: 'client',
  clientSecret: 'secret',
  refreshToken: 'refresh',
  accountId: '123',
  locationId: '456',
}

test('Google OAuth exchange uses the refresh-token grant', async () => {
  let request
  const token = await getGoogleAccessToken(config, async (url, options) => {
    request = { url, options }
    return response({ access_token: 'access-token' })
  })
  assert.equal(token, 'access-token')
  assert.equal(request.url, 'https://oauth2.googleapis.com/token')
  assert.equal(request.options.method, 'POST')
  assert.equal(request.options.body.get('grant_type'), 'refresh_token')
  assert.equal(request.options.body.get('refresh_token'), 'refresh')
})

test('review listing keeps only unanswered reviews', async () => {
  const reviews = await listUnansweredReviews(config, 'token', {
    limit: 5,
    fetchImpl: async url => {
      assert.match(url, /accounts\/123\/locations\/456\/reviews/)
      return response({ reviews: [
        { name: 'accounts/123/locations/456/reviews/a', starRating: 'FIVE' },
        { name: 'accounts/123/locations/456/reviews/b', reviewReply: { comment: 'Thanks' } },
      ] })
    },
  })
  assert.deepEqual(reviews.map(review => review.name), ['accounts/123/locations/456/reviews/a'])
})

test('publishing validates the Google resource name and sends only the reply', async () => {
  let request
  await publishReviewReply(
    'accounts/123/locations/456/reviews/abc',
    'Thank you!',
    'token',
    async (url, options) => {
      request = { url, options }
      return response({ updateTime: 'now' })
    },
  )
  assert.match(request.url, /reviews\/abc\/reply$/)
  assert.deepEqual(JSON.parse(request.options.body), { comment: 'Thank you!' })
  await assert.rejects(
    publishReviewReply('../reviews/abc', 'No', 'token', async () => response({})),
    /Invalid Google review resource name/,
  )
})

test('reply generation has safe templates and sanitizes model output', async () => {
  assert.match(buildFallbackReply({ starRating: 'ONE' }), /sorry/i)
  assert.match(buildFallbackReply({ starRating: 'FIVE' }), /Thank you/)
  assert.equal(sanitizeReply('  “Thank   you!”  '), 'Thank you!')
  const generated = await generateReviewReply(
    { starRating: 'FIVE', comment: 'Great food' },
    {
      apiKey: 'key',
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body)
        assert.equal(body.store, false)
        assert.match(body.input, /untrusted data/)
        return response({ output_text: 'Спасибо за ваш отзыв!' })
      },
    },
  )
  assert.deepEqual(generated, { reply: 'Спасибо за ваш отзыв!', source: 'openai' })
})

test('bot previews by default and publishes only with the explicit switch', async () => {
  const calls = []
  const env = {
    GOOGLE_BUSINESS_CLIENT_ID: 'client',
    GOOGLE_BUSINESS_CLIENT_SECRET: 'secret',
    GOOGLE_BUSINESS_REFRESH_TOKEN: 'refresh',
    GOOGLE_BUSINESS_ACCOUNT_ID: '123',
    GOOGLE_BUSINESS_LOCATION_ID: '456',
    GOOGLE_REVIEW_BUSINESS_NAME: 'Zar Kebab',
  }
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('oauth2.googleapis.com')) return response({ access_token: 'token' })
    if (url.endsWith('/reply')) return response({ updateTime: 'now' })
    return response({ reviews: [{
      name: 'accounts/123/locations/456/reviews/abc',
      reviewId: 'abc',
      starRating: 'FOUR',
      comment: 'Nice',
    }] })
  }

  const preview = await runGoogleReviewBot({ env, fetchImpl })
  assert.equal(preview.mode, 'preview')
  assert.equal(preview.results[0].status, 'preview')
  assert.equal(calls.some(call => call.url.endsWith('/reply')), false)

  env.GOOGLE_REVIEW_AUTO_PUBLISH = 'true'
  const published = await runGoogleReviewBot({ env, fetchImpl })
  assert.equal(published.results[0].status, 'published')
  assert.equal(calls.some(call => call.url.endsWith('/reply')), true)
})
