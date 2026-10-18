# KhunPhorBaan Frontend

Angular 18 SSR frontend for `khun-phor-baan`. The deprecated sibling `frontend/` is not used.

## Development server

Run `npm start` for a dev server. Navigate to `http://localhost:4200/th`.

Development API calls are proxied by `proxy.conf.json`:

- `/api/**` -> `http://127.0.0.1:8088`
- `/health` -> `http://127.0.0.1:8088`
- `/ready` -> `http://127.0.0.1:8088`

Start the backend on port `8088` before using authenticated/catalog workflows. Without the proxy, Angular's dev server can accidentally serve the app shell for `/api/v1/*`, which causes Vite script loading errors under `/api/v1/.../polyfills.js`.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `npm run build` to build the project. The build artifacts will be stored in `dist/frontend-2`.

## Running unit tests

Run `npm test -- --watch=false --browsers=ChromeHeadless` to execute unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
