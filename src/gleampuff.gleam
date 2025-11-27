import gleam/float
import gleam/int
import gleam/list
import gleam/option
import gleam/result
import gleam/string
import gleam_community/colour
import gleam_community/maths
import lustre
import lustre/attribute
import lustre/effect
import lustre/element as lustre_element
import lustre/element/svg
import lustre/event as lustre_event
import plinth/browser/audio
import plinth/browser/document
import plinth/browser/element
import plinth/browser/event
import plinth/browser/window
import plinth/javascript/global

pub fn main() {
  let app = lustre.application(fn(_: Nil) { init() }, update, view)
  // I couldn't get "using custom index.html with lustre/dev start" to work
  element.set_attribute(
    document.body(),
    "style",
    "margin: 0; background: black",
  )
  let assert Ok(_) = lustre.start(app, "#app", Nil)
  Nil
}

type State {
  State(
    window_width: Float,
    window_height: Float,
    held_down_left: Bool,
    held_down_right: Bool,
    lucy_angle: Float,
    lucy_x: Float,
    lucy_y: Float,
    lucy_x_per_second: Float,
    lucy_y_per_second: Float,
    lucy_y_maximum: Float,
    lucy_y_highscore: Float,
  )
}

const initial_lucy_y_per_second: Float = 2.3

fn init() -> #(State, effect.Effect(Event)) {
  #(
    State(
      window_height: window.inner_height(window.self()) |> int.to_float,
      window_width: window.inner_width(window.self()) |> int.to_float,
      held_down_left: False,
      held_down_right: False,
      lucy_angle: 0.0,
      lucy_x_per_second: 0.0,
      lucy_y_per_second: initial_lucy_y_per_second,
      lucy_x: 0.0,
      lucy_y: 0.0,
      lucy_y_maximum: 0.0,
      lucy_y_highscore: 0.0,
    ),
    effect.batch([
      effect.from(fn(dispatch) {
        window.add_event_listener("resize", fn(_event) { dispatch(Resized) })
      }),
      effect.from(fn(dispatch) {
        let _ =
          global.set_interval(1000 / 60, fn() { dispatch(SimulationTickPassed) })
        Nil
      }),
      effect.from(fn(dispatch) {
        window.add_event_listener("keydown", fn(e) {
          dispatch(KeyPressed(event.key(e)))
        })
      }),
      effect.from(fn(dispatch) {
        window.add_event_listener("keyup", fn(e) {
          dispatch(KeyReleased(event.key(e)))
        })
      }),
    ]),
  )
}

type Event {
  Resized
  SimulationTickPassed
  KeyPressed(String)
  KeyReleased(String)
}

fn update(state: State, event: Event) -> #(State, effect.Effect(Event)) {
  case event {
    Resized -> #(
      State(
        ..state,
        window_height: window.inner_height(window.self()) |> int.to_float,
        window_width: window.inner_width(window.self()) |> int.to_float,
      ),
      effect.none(),
    )
    KeyPressed(key) -> {
      case key_as_x_direction(key) {
        option.None -> #(state, effect.none())
        option.Some(Left) -> #(
          State(..state, held_down_left: True),
          effect.none(),
        )
        option.Some(Right) -> #(
          State(..state, held_down_right: True),
          effect.none(),
        )
      }
    }
    KeyReleased(key) -> {
      case key_as_x_direction(key) {
        option.None -> #(state, effect.none())
        option.Some(Left) -> #(
          State(..state, held_down_left: False),
          effect.none(),
        )
        option.Some(Right) -> #(
          State(..state, held_down_right: False),
          effect.none(),
        )
      }
    }
    SimulationTickPassed -> {
      let effective_held_x_direction = case
        state.held_down_left,
        state.held_down_right
      {
        True, False -> -1.0
        False, True -> 1.0
        True, True | False, False -> 0.0
      }
      let seconds_passed = 1.0 /. { 1000 / 60 |> int.to_float }
      let new_lucy_y_per_second =
        state.lucy_y_per_second -. { 1.0 *. seconds_passed } |> float.max(-2.2)
      let new_lucy_x_per_second =
        state.lucy_x_per_second
        *. { 1.0 -. { 0.2 *. seconds_passed } }
        +. {
          effective_held_x_direction
          *. {
            4.4
            -. float.absolute_value(
              state.lucy_x_per_second +. effective_held_x_direction *. 2.2,
            )
          }
          *. 3.0
          *. seconds_passed
        }
      let new_lucy_y =
        state.lucy_y +. { new_lucy_y_per_second *. seconds_passed }
      let new_lucy_x_not_wrapped =
        state.lucy_x +. { new_lucy_x_per_second *. seconds_passed }
      let new_lucy_x = case
        new_lucy_x_not_wrapped
        <. float.negate(screen_width /. 2.0 +. lucy_radius)
      {
        True -> new_lucy_x_not_wrapped +. { screen_width +. lucy_radius *. 2.0 }
        False ->
          case new_lucy_x_not_wrapped >. screen_width /. 2.0 +. lucy_radius {
            True ->
              new_lucy_x_not_wrapped -. { screen_width +. lucy_radius *. 2.0 }
            False -> new_lucy_x_not_wrapped
          }
      }
      let lucy_falls_on_cloud: Bool =
        new_lucy_y_per_second <. 0.0
        && cloud_positions
        |> list.any(fn(cloud_position) {
          let #(cloud_x, cloud_y) = cloud_position
          {
            float.absolute_value(new_lucy_y -. cloud_y)
            <=. { cloud_height /. 2.0 }
          }
          && {
            float.absolute_value(new_lucy_x -. cloud_x)
            <=. { cloud_width /. 2.0 }
          }
        })
      case new_lucy_y <. float.negate(screen_height *. 0.9) {
        True -> #(
          State(
            window_width: state.window_width,
            window_height: state.window_height,
            held_down_left: state.held_down_left,
            held_down_right: state.held_down_right,
            lucy_angle: 0.0,
            lucy_y_per_second: initial_lucy_y_per_second,
            lucy_y: 0.0,
            lucy_x_per_second: 0.0,
            lucy_x: 0.0,
            lucy_y_maximum: 0.0,
            lucy_y_highscore: state.lucy_y_maximum,
          ),
          effect.none(),
        )
        False -> #(
          State(
            ..state,
            lucy_angle: state.lucy_angle +. { 1.0 *. seconds_passed },
            lucy_y_per_second: case lucy_falls_on_cloud {
              True -> 2.6
              False -> new_lucy_y_per_second
            },
            lucy_y: // consider using the potentially bounced lucy_y_per_second
            new_lucy_y,
            lucy_x_per_second: new_lucy_x_per_second,
            lucy_x: new_lucy_x,
          ),
          case lucy_falls_on_cloud {
            True ->
              effect.from(fn(_) {
                // TODO monotone, variate pitch and adjust volume
                let _ = audio.play(audio.new("cloud-bounce.mp3"))
                Nil
              })
            False -> effect.none()
          },
        )
      }
    }
  }
}

type XDirection {
  Left
  Right
}

fn key_as_x_direction(key: String) -> option.Option(XDirection) {
  case key {
    "ArrowLeft" -> option.Some(Left)
    "ArrowRight" -> option.Some(Right)
    "a" -> option.Some(Left)
    "d" -> option.Some(Right)
    _ -> option.None
  }
}

const screen_width: Float = 16.0

const screen_height: Float = 9.0

const goal_y: Float = 100.0

fn view(state: State) -> lustre_element.Element(Event) {
  let ration_width_to_height: Float = screen_width /. screen_height
  let #(svg_width, svg_height) = case
    state.window_width <. state.window_height *. ration_width_to_height
  {
    True ->
      // disproportional in height
      #(state.window_width, state.window_width /. ration_width_to_height)

    False ->
      // might be disproportional in width
      #(state.window_height *. ration_width_to_height, state.window_height)
  }
  let progress: Float =
    state.lucy_y *. { 1.0 /. goal_y }
    // TODO set to final height (200 or something) 
    |> float.max(0.0)
    |> float.min(1.0)

  svg.svg(
    [
      attribute.style("position", "absolute"),
      attribute.style(
        "right",
        { { state.window_width -. svg_width } /. 2.0 } |> float.to_string
          <> "px",
      ),
      attribute.style(
        "bottom",
        { { state.window_height -. svg_height } /. 2.0 } |> float.to_string
          <> "px",
      ),
      attribute.width(svg_width |> float.truncate),
      attribute.height(svg_height |> float.truncate),
    ],
    [
      svg.g([], [
        svg.rect([
          attribute.attribute("x", "0"),
          attribute.attribute("y", "-100%"),
          attribute.attribute("width", "100%"),
          attribute.attribute("height", "100%"),
          attribute.attribute(
            "fill",
            colour.from_rgb(
              state.lucy_y *. { -1.0 /. screen_height }
                |> float.max(0.0)
                |> float.min(0.7),
              { 0.45 -. { progress *. 0.6 } } |> float.max(0.0),
              0.6 -. { progress *. 0.56 },
            )
              |> result.unwrap(colour.black)
              |> colour.to_css_rgba_string,
          ),
        ]),
        svg.text(
          [
            attribute.attribute("x", screen_width /. 2.0 |> float.to_string),
            attribute.attribute("y", screen_height *. 0.95 |> float.to_string),
            attribute.attribute("pointer-events", "none"),
            attribute.style("text-anchor", "middle"),
            attribute.style("font-weight", "bold"),
            attribute.style("font-size", "1px"),
            attribute.style("font-family", "\"cubano\", monaco, courier"),
            attribute.style(
              "text-shadow",
              "-1px 0 black, 0 1px black, 1px 0 black, 0 -1px black, -2px 2px black, -1.8px 1.8px black, -1.6px 1.6px black, -1.5px 1.5px black, -1px 1px black, -3px 3px black, -2px 2px black, -1px 1px black",
            ),
            attribute.style(
              "fill",
              colour.from_rgb(0.9, 1.0, 0.86)
                |> result.unwrap(colour.black)
                |> colour.to_css_rgba_string,
            ),
          ],
          state.lucy_y |> float.truncate |> int.to_string <> "m",
        )
          |> svg_scale(1.0, -1.0),
        svg.g([], [
          svg_lucy()
            |> svg_scale(0.5, 0.5)
            |> svg_rotate(state.lucy_angle)
            |> svg_translate(state.lucy_x, state.lucy_y),
          svg.g(
            [],
            cloud_positions
              |> list.map(fn(position) {
                let #(x, y) = position
                svg_cloud() |> svg_translate(x, y)
              }),
          ),
        ])
          |> svg_translate(
            screen_width /. 2.0,
            float.negate(screen_height *. 0.56)
              -. { state.lucy_y |> float.max(0.0) },
          ),
      ])
      |> svg_scale(
        svg_width /. screen_width,
        float.negate(svg_height /. screen_height),
      ),
    ],
  )
}

const star_positions: List(Point) = [#(-2.0, 40.0), #(2.0, 41.0)]

fn svg_small_star() -> lustre_element.Element(_event) {
  svg.circle([
    attribute.attribute("r", "0.03"),
    attribute.attribute("fill", "white"),
  ])
}

fn svg_lucy() -> lustre_element.Element(event) {
  svg.g([], [
    svg.path([
      attribute.attribute("stroke-width", "0.23"),
      attribute.attribute("stroke-linejoin", "round"),
      attribute.attribute(
        "stroke",
        lucy_color()
          |> colour.to_css_rgba_string,
      ),
      attribute.attribute(
        "fill",
        lucy_color()
          |> colour.to_css_rgba_string,
      ),
      attribute.attribute("d", lucy_path()),
    ]),
    svg.circle([
      attribute.attribute("cy", "0.12"),
      attribute.attribute("cx", "-0.2"),
      attribute.attribute("r", "0.1"),
      attribute.attribute("fill", "black"),
    ]),
    svg.circle([
      attribute.attribute("cy", "0.12"),
      attribute.attribute("cx", "0.2"),
      attribute.attribute("r", "0.1"),
      attribute.attribute("fill", "black"),
    ]),
    svg.circle([
      attribute.attribute("cy", "-0.1"),
      attribute.attribute("cx", "0"),
      attribute.attribute("r", "0.12"),
      attribute.attribute("fill", "none"),
      attribute.attribute("stroke", "black"),
      attribute.attribute("stroke-width", "0.08"),
      attribute.attribute("pathLength", "360"),
      attribute.attribute("stroke-dasharray", "0 180 180"),
      attribute.attribute("stroke-linecap", "round"),
    ]),
  ])
}

/// TODO make svg_lucy etc depend on it
const lucy_radius = 0.5

fn lucy_path() -> String {
  "M 0,0\n"
  <> star_shape_points()
  |> list.map(fn(points) {
    let #(inner, outer) = points
    let #(x, y) = inner
    let #(ox, oy) = outer
    "Q "
    <> x |> float.to_string
    <> ","
    <> y |> float.to_string
    <> " "
    <> ox |> float.to_string
    <> ","
    <> oy |> float.to_string
  })
  |> string.join("\n")
  <> "\nz"
}

fn lucy_color() {
  colour.from_rgb(1.0, 0.5, 1.0)
  |> result.unwrap(colour.black)
}

fn svg_cloud() -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.style(
        "fill",
        colour.from_rgb(0.9, 1.0, 0.86)
          |> result.unwrap(colour.black)
          |> colour.to_css_rgba_string,
      ),
    ],
    [
      svg.circle([
        attribute.attribute("cy", "0.12"),
        attribute.attribute("cx", "-0.27"),
        attribute.attribute("r", "0.25"),
      ]),
      svg.circle([
        attribute.attribute("cy", "0.12"),
        attribute.attribute("cx", "0.12"),
        attribute.attribute("r", "0.3"),
      ]),
      svg.circle([
        attribute.attribute("cy", "-0.17"),
        attribute.attribute("cx", "0.3"),
        attribute.attribute("r", "0.21"),
      ]),
      svg.circle([
        attribute.attribute("cy", "0"),
        attribute.attribute("cx", "0.5"),
        attribute.attribute("r", "0.15"),
      ]),
    ],
  )
  |> svg_scale(1.2, 1.2)
}

const cloud_positions: List(Point) = [
  #(-1.2, 1.8),
  #(1.2, 4.0),
  #(-1.5, 5.4),
  #(1.2, 6.1),
  #(3.2, 9.1),
  #(-3.2, 9.1),
  #(-3.1, 11.3),
  #(-2.7, 14.0),
  #(2.5, 15.0),
  #(0.0, 18.0),
  #(-0.2, 21.0),
  #(0.1, 24.0),
  #(4.1, 23.0),
  #(4.1, 26.0),
  #(2.0, 27.0),
  #(0.0, 28.0),
  #(-2.0, 29.0),
  #(-4.0, 30.05),
  #(-4.0, 30.05),
  #(-6.0, 32.05),
  #(-4.1, 33.0),
  #(-4.1, 36.0),
  #(-2.0, 37.0),
  #(0.2, 39.0),
  #(-0.1, 34.0),
  #(0.0, 41.0),
  #(6.0, 44.0),
  #(-6.0, 47.0),
  #(2.0, 49.0),
  #(-6.0, 51.0),
  #(-5.4, 52.6),
  #(2.0, 53.0),
  #(-5.6, 56.9),
  #(-5.8, 56.5),
  #(2.0, 59.5),
  #(0.0, 62.0),
  #(0.4, 63.6),
  #(0.7, 64.1),
  #(-6.0, 66.6),
  #(4.4, 69.6),
  #(4.7, 70.1),
  #(-4.4, 73.6),
  #(-4.7, 74.1),
  #(4.4, 77.2),
  #(-6.7, 78.7),
  #(4.4, 79.6),
  #(4.7, 80.1),
  #(0.1, 81.1),
  #(0.0, 81.6),
  #(-0.2, 81.1),
  #(-1.7, 82.7),
  #(-0.9, 83.1),
  #(-3.9, 84.1),
  #(3.9, 84.1),
  #(-2.9, 85.1),
  #(2.9, 85.1),
  #(-1.9, 86.1),
  #(1.9, 86.1),
  #(-0.9, 87.1),
  #(0.9, 87.1),
  #(0.0, 90.1),
  #(0.2, 93.1),
  #(-3.7, 93.2),
  #(3.4, 93.2),
  #(-0.2, 95.7),
  #(0.7, 95.9),
  #(-1.2, 96.0),
  #(-5.1, 96.0),
  #(4.0, 96.1),
  #(-0.8, 96.1),
  #(0.3, 96.1),
  #(0.4, 96.3),
  #(-1.1, 96.5),
  #(-0.6, 96.6),
  #(0.1, 96.7),
  #(-1.9, 97.0),
  #(-0.4, 97.1),
]

const cloud_width: Float = 2.0

const cloud_height: Float = 1.0

fn svg_scale(
  svg: lustre_element.Element(event),
  x: Float,
  y: Float,
) -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "scale("
          <> { x |> float.to_string }
          <> ", "
          <> { y |> float.to_string }
          <> ")",
      ),
    ],
    [svg],
  )
}

fn svg_translate(
  svg: lustre_element.Element(event),
  x: Float,
  y: Float,
) -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "translate("
          <> { x |> float.to_string }
          <> ", "
          <> { y |> float.to_string }
          <> ")",
      ),
    ],
    [svg],
  )
}

fn svg_rotate(
  svg: lustre_element.Element(event),
  angle: Float,
) -> lustre_element.Element(event) {
  svg.g(
    [
      attribute.attribute(
        "transform",
        "rotate(" <> angle /. maths.pi() *. 180.0 |> float.to_string <> ")",
      ),
    ],
    [svg],
  )
}

type Point =
  #(Float, Float)

fn star_shape_points() -> List(#(Point, Point)) {
  let angle_step = 2.0 *. maths.pi() /. 5.0
  list.range(0, 5)
  |> list.map(fn(i) {
    let angle = angle_step *. { i |> int.to_float }
    #(#(maths.cos(angle), maths.sin(angle)) |> point_scale_by(0.268), #(
      maths.cos(angle +. { angle_step /. 2.0 }),
      maths.sin(angle +. { angle_step /. 2.0 }),
    ))
  })
}

fn point_scale_by(point: Point, scale: Float) -> Point {
  let #(x, y) = point
  #(x *. scale, y *. scale)
}
