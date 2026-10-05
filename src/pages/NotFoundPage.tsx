import { href } from '../router.ts'

export function NotFoundPage({ what }: { what: string }) {
  return (
    <div class="page">
      <h1>That {what} is not here</h1>
      <p class="lead">The address does not match anything in this app. It may have been renamed.</p>
      <ul class="link-list">
        <li>
          <a href={href.home()}>Go to Continue</a>
        </li>
        <li>
          <a href={href.skills()}>See the skills</a>
        </li>
        <li>
          <a href={href.problems()}>Browse the problems</a>
        </li>
      </ul>
    </div>
  )
}
