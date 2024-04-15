import { act, renderHook } from '@testing-library/react'

import type { CustomProviderHooks, DbAuthClientArgs } from '../dbAuth'
import { createDbAuthClient, createMiddlewareAuth } from '../dbAuth'

import { fetchMock } from './dbAuth.test'

const defaultArgs = {
  fetchConfig: {
    credentials: 'include' as const,
  },
}

export function getMwDbAuth(
  args: DbAuthClientArgs & CustomProviderHooks = defaultArgs,
) {
  // We have to create a special createDbAuthClient with middleware = true
  const dbAuthClient = createDbAuthClient({ ...args, middleware: true })
  const { useAuth, AuthProvider } = createMiddlewareAuth(dbAuthClient, {
    useCurrentUser: args.useCurrentUser,
    useHasRole: args.useHasRole,
  })
  const { result } = renderHook(() => useAuth(), {
    wrapper: AuthProvider,
  })

  return result
}

// These tests are on top of the other tests in dbAuth.test.ts
// They test the middleware specific things about the dbAuth client

describe('dbAuth web ~ cookie/middleware auth', () => {
  it('will create a middleware version of the auth client', async () => {
    const { current: dbAuthInstance } = getMwDbAuth()

    // Middleware auth clients should not return tokens
    expect(await dbAuthInstance.getToken()).toBeNull()

    let currentUser
    await act(async () => {
      currentUser = await dbAuthInstance.getCurrentUser()
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      // Doesn't speak to graphql!
      '/middleware/dbauth/currentUser',
      expect.objectContaining({
        credentials: 'include',
        method: 'GET', // in mw auth, we use GET for currentUser
      }),
    )

    expect(currentUser).toEqual({
      id: 'middleware-user-555',
      username: 'user@middleware.auth',
    })
  })

  it('can still override getCurrentUser', async () => {
    const mockedCustomCurrentUser = jest.fn()
    const { current: dbAuthInstance } = getMwDbAuth({
      useCurrentUser: mockedCustomCurrentUser,
    })
    await act(async () => {
      await dbAuthInstance.getCurrentUser()
    })

    expect(mockedCustomCurrentUser).toHaveBeenCalled()
  })

  it('allows you to override the middleware endpoint', async () => {
    const auth = getMwDbAuth({
      dbAuthUrl: '/hello/handsome',
    }).current

    await act(async () => await auth.forgotPassword('username'))

    expect(fetchMock).toHaveBeenCalledWith(
      '/hello/handsome',
      expect.any(Object),
    )
  })

  it('calls login at the middleware endpoint', async () => {
    const auth = getMwDbAuth().current

    await act(
      async () =>
        await auth.logIn({ username: 'username', password: 'password' }),
    )

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/middleware/dbauth',
      expect.any(Object),
    )
  })

  it('calls middleware endpoint for logout', async () => {
    const auth = getMwDbAuth().current
    await act(async () => {
      await auth.logOut()
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/middleware/dbauth', {
      body: '{"method":"logout"}',
      credentials: 'include',
      method: 'POST',
    })
  })

  it('calls reset password at the correct endpoint', async () => {
    const auth = getMwDbAuth().current

    await act(
      async () =>
        await auth.resetPassword({
          resetToken: 'reset-token',
          password: 'password',
        }),
    )

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/middleware/dbauth',
      expect.objectContaining({
        body: '{"resetToken":"reset-token","password":"password","method":"resetPassword"}',
      }),
    )
  })

  it('passes through fetchOptions to signup calls', async () => {
    const auth = getMwDbAuth().current

    await act(
      async () =>
        await auth.signUp({
          username: 'username',
          password: 'password',
        }),
    )

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/middleware/dbauth',
      expect.objectContaining({
        method: 'POST',
        body: '{"username":"username","password":"password","method":"signup"}',
      }),
    )
  })
})
